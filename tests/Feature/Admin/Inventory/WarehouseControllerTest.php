<?php

namespace Tests\Feature\Admin\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\StoreVariant;
use App\Models\Item\ItemVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

class WarehouseControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Clear Spatie Cache
        $this->app->make(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        // Ensure Role exists
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->actingAs($admin);
    }

    #[Test]
    public function it_displays_warehouses_and_stock_data()
    {
        // 1. Create dependencies
        $item = \App\Models\Item\Item::create([
            'product_name' => 'Dispencer big',
            'product_description' => 'Manual test description',
            'packaging_details' => 'Manual packaging',
            'price' => 384.92,
            'status' => 'active',
            'incomplete' => 1,
            'category_id' => 1,
            'sku' => 'TSHIRT',
            'product_images' => json_encode(["https://via.placeholder.com/150"]),
        ]);
        $color = \App\Models\Item\ItemColor::create(['name' => 'Red', 'code' => 'RD']);
        $pkg = \App\Models\Item\ItemPackagingType::create(['name' => 'Single', 'code' => 'S1']);

        // 2. Create the Variant (using your shared logic)
        $variant = ItemVariant::create([
            'item_id' => $item->id,
            'item_color_id' => $color->id,
            'item_packaging_type_id' => $pkg->id,
            'sku' => 'TSH-RED-S1-TEST',
            'barcode' => (string) rand(1000000000, 9999999999),
            'packaging_total_pieces' => 1,
            'status' => 'active',
        ]);

        // 3. Create Warehouse and Stock
        $warehouse = Warehouse::create(['name' => 'Main Hub', 'code' => 'WH-1', 'status' => 'active']);

        // Link through StoreVariant
        $storeVariant = \App\Models\Store\StoreVariant::create([
            'item_variant_id' => $variant->id,
            'store_id' => 1,
        ]);

        \App\Models\StockKeeper\ItemStock::create([
            'item_variant_id' => $storeVariant->id,
            'location_id' => $warehouse->id,
            'location_type' => Warehouse::class,
            'quantity' => 100,
            'min_stock_level' => 10,
        ]);

        // 4. Run Test
        $response = $this->get(route('admin.inventory.warehouse'));
        $response->assertStatus(200);
    }
}
