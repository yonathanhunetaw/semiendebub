<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The item → variant picker's two JSON steps, with and without a location.
 */
class ItemPickerEndpointsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function items_then_variants_are_listed_and_a_location_limits_both(): void
    {
        Role::firstOrCreate(['name' => 'admin']);
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $stocked = ItemVariant::factory()->create();
        $unstocked = ItemVariant::factory()->create();
        $place = StockLocation::factory()->create();
        app(StockService::class)->receive($stocked->id, $place, 5);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($admin);

        $this->getJson(route('admin.inventory.item_options'))->assertOk()
            ->assertJsonFragment(['id' => $stocked->item_id])
            ->assertJsonFragment(['id' => $unstocked->item_id]);

        $this->getJson(route('admin.inventory.item_options', ['location' => $place->id]))->assertOk()
            ->assertJsonFragment(['id' => $stocked->item_id])
            ->assertJsonMissing(['id' => $unstocked->item_id]);

        $this->getJson(route('admin.inventory.items.variant_options', [$stocked->item_id, 'location' => $place->id]))->assertOk()
            ->assertJsonPath('variants.0.id', $stocked->id);

        $this->getJson(route('admin.inventory.items.variant_options', [$unstocked->item_id, 'location' => $place->id]))->assertOk()
            ->assertJsonCount(0, 'variants');
    }
}
