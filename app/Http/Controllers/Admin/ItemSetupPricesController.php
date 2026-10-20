<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveItemPartyPricesRequest;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Services\Item\StorePrices;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** Seller and customer prices for an item in a store, on the item setup page. */
final class ItemSetupPricesController extends Controller
{
    public function __construct(private readonly StorePrices $prices)
    {
    }

    public function saveSeller(SaveItemPartyPricesRequest $request, Item $item, Store $store): RedirectResponse
    {
        $seller = User::query()->findOrFail((int) $request->validated('seller_id'));
        $type = (string) $request->validated('customer_type');
        $saved = $this->prices->saveSeller($store, $item, $seller, $type, $request->validated('variants'));

        return back()->with('success', "{$seller->first_name}'s {$type} prices saved ({$saved} variant".($saved === 1 ? '' : 's').').');
    }

    public function removeSeller(Request $request, Item $item, Store $store, User $seller): RedirectResponse
    {
        $data = $request->validate(['customer_type' => ['required', 'in:business,individual']]);
        $this->prices->removeSeller($store, $item, $seller, $data['customer_type']);

        return back()->with('success', "{$seller->first_name}'s {$data['customer_type']} prices removed.");
    }

    public function saveCustomer(SaveItemPartyPricesRequest $request, Item $item, Store $store): RedirectResponse
    {
        $customer = Customer::query()->findOrFail((int) $request->validated('customer_id'));
        $saved = $this->prices->saveCustomer($store, $item, $customer, $request->validated('variants'));

        return back()->with('success', "{$customer->name}'s prices saved ({$saved} variant".($saved === 1 ? '' : 's').').');
    }

    public function removeCustomer(Item $item, Store $store, Customer $customer): RedirectResponse
    {
        $this->prices->removeCustomer($store, $item, $customer);

        return back()->with('success', "{$customer->name}'s prices removed.");
    }

    /** The store's customers matching a name, phone or TIN, for the picker. */
    public function customers(Request $request, Store $store): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        $rows = Customer::query()
            ->where(fn ($w) => $w->whereNull('store_id')->orWhere('store_id', $store->id))
            // Every word typed must appear in the name, first name, last name, phone or TIN: "Demo Customer 55" finds
            // first name Demo + last name Customer 55 (written to work on MySQL and SQLite alike).
            ->when($q !== '', function ($w) use ($q): void {
                foreach (preg_split('/\s+/', $q) ?: [] as $word) {
                    $w->where(fn ($m) => $m->where('name', 'like', "%{$word}%")->orWhere('first_name', 'like', "%{$word}%")
                        ->orWhere('last_name', 'like', "%{$word}%")->orWhere('phone_number', 'like', "%{$word}%")->orWhere('tin_number', 'like', "%{$word}%"));
                }
            })
            // A customer made on the seller's form has a first and last name and no stored "name".
            ->orderBy('first_name')->orderBy('last_name')->limit(15)->get();

        return response()->json($rows->map(fn (Customer $c): array => [
            'id' => (int) $c->id,
            'name' => (string) $c->name,
            'phone' => (string) $c->phone_number,
            'type' => $this->prices->typeOf($c),
        ])->all());
    }
}
