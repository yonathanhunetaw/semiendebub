<?php

declare(strict_types=1);

namespace Tests\Feature\Admin\Concerns;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Item\ItemDeployer;
use Spatie\Permission\Models\Role;

/**
 * A complete item (name, category, picture, one variant with packaging and a barcode) and a store, a global admin
 * to work with, and the helpers every item setup test shares.
 */
trait BuildsSetupItem
{
    protected Store $store;

    protected Item $item;

    protected ItemVariant $variant;

    protected User $admin;

    protected function setUpSetupItem(): void
    {
        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->admin = $this->makeUser('admin', null);
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->item = Item::factory()->create([
            'product_name' => 'Pencil HB', 'item_category_id' => ItemCategory::factory()->create(['category_name' => 'Pencils'])->id,
            'status' => 'active', 'general_images' => ['uploads/items/pencil.jpg'], 'description' => '',
        ]);
        $this->variant = ItemVariant::factory()->create([
            'item_id' => $this->item->id, 'barcode' => '6001234567890',
            'item_packaging_type_id' => ItemPackagingType::factory()->create()->id,
        ]);
    }

    protected function makeUser(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        Role::firstOrCreate(['name' => $role]);
        $user->assignRole($role);

        return $user;
    }

    /** Deploys the item to the store and prices every variant (switched on). */
    protected function deployed(float $price = 10.0): StoreVariant
    {
        app(ItemDeployer::class)->deploy($this->item->fresh(), $this->store);
        StoreVariant::query()->where('store_id', $this->store->id)->update(['pricing_matrix' => ['price' => $price, 'discount_price' => null, 'discount_ends_at' => null], 'active' => true]);

        return StoreVariant::query()->where('store_id', $this->store->id)->where('item_variant_id', $this->variant->id)->firstOrFail();
    }

    protected function place(string $kind, ?Store $store = null): StockLocation
    {
        return StockLocation::query()->where('store_id', ($store ?? $this->store)->id)->where('kind', $kind)->firstOrFail();
    }

    protected function shelf(?Store $store = null): StockLocation
    {
        return $this->place(StockLocation::KIND_SHELF, $store);
    }

    protected function floor(?Store $store = null): StockLocation
    {
        return $this->place(StockLocation::KIND_BACKROOM, $store);
    }
}
