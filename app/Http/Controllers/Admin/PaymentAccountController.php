<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\SavePaymentAccountRequest;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Store\Store;
use App\Services\Admin\ActiveStore;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The accounts customers pay into, per store, and who owns each.
 *
 * Sellers at a store see that store's active collection accounts at checkout;
 * the owner is the seller who confirms each deposit arrived. Removing an
 * account keeps it on the payments already made into it.
 */
class PaymentAccountController extends Controller
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    public function index(): Response
    {
        return Inertia::render('Admin/Payments/Accounts', [
            'accounts' => $this->activeStore->apply(PaymentAccount::query())
                ->with(['store', 'owner', 'remitters:id'])
                ->withCount(['payments as waiting' => fn ($q) => $q->where('status', Payment::STATUS_CLAIMED)])
                ->orderBy('store_id')
                ->orderBy('purpose')
                ->orderBy('provider')
                ->get()
                ->map(fn (PaymentAccount $account): array => [
                    'id' => (int) $account->id,
                    'store_id' => (int) $account->store_id,
                    'store' => $account->store?->name,
                    'type' => (string) $account->type,
                    'provider' => (string) $account->provider,
                    'provider_name' => $account->providerName(),
                    'account_number' => (string) $account->account_number,
                    'account_name' => (string) $account->account_name,
                    'owner_user_id' => (int) $account->owner_user_id,
                    'owner' => $account->owner ? trim($account->owner->first_name.' '.$account->owner->last_name) : null,
                    'purpose' => (string) $account->purpose,
                    'is_active' => (bool) $account->is_active,
                    'waiting' => (int) $account->waiting,
                    'remitter_ids' => $account->remitters->pluck('id')->map(fn ($id): int => (int) $id)->values(),
                ])->values(),
            'stores' => $this->activeStore->accessibleStores()
                ->map(fn (Store $store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])->values(),
            'default_store_id' => $this->activeStore->id(),
            'owners' => $this->activeStore->apply(User::role('seller'), 'users.store_id')->orderBy('first_name')->get(['id', 'first_name', 'last_name', 'store_id'])
                ->map(fn (User $user): array => [
                    'id' => (int) $user->id,
                    'name' => trim($user->first_name.' '.$user->last_name),
                    'store_id' => $user->store_id !== null ? (int) $user->store_id : null,
                ])->values(),
            'providers' => collect(config('payments.providers', []))
                ->map(fn (array $provider, string $id): array => ['id' => $id, 'name' => $provider['name'], 'type' => $provider['type']])
                ->values(),
        ]);
    }

    public function store(SavePaymentAccountRequest $request): RedirectResponse
    {
        $this->authorizeWrite($request);

        $account = PaymentAccount::query()->create($request->accountData());
        $account->remitters()->sync($request->remitterIds());

        return back()->with('success', "{$account->label()} added.");
    }

    public function update(SavePaymentAccountRequest $request, PaymentAccount $paymentAccount): RedirectResponse
    {
        abort_unless($this->activeStore->allows((int) $paymentAccount->store_id), 404);
        $this->authorizeWrite($request);

        $paymentAccount->update($request->accountData());
        $paymentAccount->remitters()->sync($request->remitterIds());

        return back()->with('success', "{$paymentAccount->label()} updated.");
    }

    public function destroy(PaymentAccount $paymentAccount): RedirectResponse
    {
        abort_unless($this->activeStore->allows((int) $paymentAccount->store_id), 404);

        if ($paymentAccount->payments()->whereIn('status', [Payment::STATUS_PENDING, Payment::STATUS_CLAIMED])->exists()) {
            return back()->with('error', "{$paymentAccount->label()} has payments still waiting. Turn it off instead.");
        }

        $paymentAccount->delete();

        return back()->with('success', "{$paymentAccount->label()} removed.");
    }

    /** A store admin writes accounts, and picks owners, of their own stores only. */
    private function authorizeWrite(SavePaymentAccountRequest $request): void
    {
        $data = $request->accountData();
        $ownerStore = User::query()->whereKey($data['owner_user_id'] ?? 0)->value('store_id');

        abort_unless($this->activeStore->allows((int) $data['store_id']), 403);
        abort_unless($this->activeStore->isGlobal() || $this->activeStore->allows($ownerStore !== null ? (int) $ownerStore : null), 403);
    }
}
