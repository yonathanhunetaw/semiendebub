<?php

declare(strict_types=1);

namespace App\Services\Vendor;

use App\Exceptions\VendorException;
use App\Models\Auth\User;
use App\Models\Store\Store;
use App\Models\Vendor\VendorApplication;
use App\Services\Inventory\StockPermissions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Vendor V1 (docs/plans/missing-areas-prompt.md §6.3): a business applies, a
 * global admin approves or rejects. Approving creates the store (its location
 * nodes come with it, Store::booted) and its owner: a store admin of that one
 * store who also holds the vendor role, signed in by a one-time link to set a
 * password. Rejecting keeps the application with the reason.
 */
class VendorOnboarding
{
    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    /** @param  array<string, mixed>  $data  validated by ApplyVendorRequest */
    public function apply(array $data): VendorApplication
    {
        return VendorApplication::query()->create($data + ['status' => VendorApplication::STATUS_PENDING]);
    }

    /**
     * @return array{store: Store, owner: User, set_password_url: string}
     *
     * @throws VendorException
     */
    public function approve(VendorApplication $application, User $by): array
    {
        $this->assertReviewer($by);

        return DB::transaction(function () use ($application, $by): array {
            $application = VendorApplication::query()->lockForUpdate()->findOrFail($application->id);

            if ($application->status !== VendorApplication::STATUS_PENDING) {
                throw new VendorException('This application was already '.$application->status.'.');
            }

            if (User::query()->where('email', $application->email)->exists()) {
                throw new VendorException("Someone already signs in with {$application->email}. Ask the business for another email.");
            }

            if (User::query()->where('phone_number', $application->phone_number)->exists()) {
                throw new VendorException("Someone already uses the phone number {$application->phone_number}.");
            }

            $store = Store::query()->create([
                'name' => $application->business_name,
                'type' => Store::TYPE_RETAIL,
                'status' => 'active',
                'location' => $application->city ?? '',
                'description' => $application->description,
                'contact_phone' => $application->phone_number,
                'contact_email' => $application->email,
            ]);

            $owner = User::query()->create([
                'first_name' => $application->contact_first_name,
                'last_name' => $application->contact_last_name,
                'email' => $application->email,
                'phone_number' => $application->phone_number,
                // Never used: the owner sets their own through the link below.
                'password' => Hash::make(Str::random(40)),
                'role' => 'admin',
                'store_id' => $store->id,
                'created_by' => $by->id,
            ]);
            $owner->forceFill(['email_verified_at' => now()])->save();
            $owner->syncRoles(['admin', 'vendor']);

            $store->forceFill(['owner_id' => $owner->id])->save();

            $application->update([
                'status' => VendorApplication::STATUS_APPROVED,
                'reviewed_by' => $by->id,
                'reviewed_at' => now(),
                'store_id' => $store->id,
                'user_id' => $owner->id,
            ]);

            return ['store' => $store, 'owner' => $owner, 'set_password_url' => $this->setPasswordUrl($owner)];
        });
    }

    /** @throws VendorException */
    public function reject(VendorApplication $application, User $by, string $reason): VendorApplication
    {
        $this->assertReviewer($by);

        return DB::transaction(function () use ($application, $by, $reason): VendorApplication {
            $application = VendorApplication::query()->lockForUpdate()->findOrFail($application->id);

            if ($application->status !== VendorApplication::STATUS_PENDING) {
                throw new VendorException('This application was already '.$application->status.'.');
            }

            $application->update([
                'status' => VendorApplication::STATUS_REJECTED,
                'reject_reason' => $reason,
                'reviewed_by' => $by->id,
                'reviewed_at' => now(),
            ]);

            return $application;
        });
    }

    /** A fresh one-time "set your password" link for a store's owner (valid as long as reset links are). */
    public function setPasswordUrl(User $owner): string
    {
        return route('password.reset', ['token' => Password::broker()->createToken($owner), 'email' => $owner->email]);
    }

    /** The store a vendor runs: the one they own, else none. */
    public function storeOf(User $user): ?Store
    {
        return Store::query()->where('owner_id', $user->id)->first();
    }

    /** @throws VendorException */
    private function assertReviewer(User $by): void
    {
        if (! $this->permissions->isGlobalAdmin($by)) {
            throw new VendorException('Only a global admin opens a new store.', 403);
        }
    }
}
