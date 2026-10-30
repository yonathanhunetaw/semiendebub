<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The Store page is a hub of grouped cards; the screens under it carry a back
 * link. It opens for a global admin on any store, for a store admin on their
 * own store only, and hands the page its figures and the two approval counts.
 */
class StoreHubTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function hub(Store $store): string
    {
        return 'http://admin.'.config('app.system_domain').route('store.hub', $store, false);
    }

    #[Test]
    public function a_global_admin_opens_any_stores_hub_with_its_counts(): void
    {
        $store = Store::factory()->create();

        $this->actingAs($this->user('admin'))->get($this->hub($store))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Stores/Hub')
                ->where('store.id', $store->id)
                ->has('stats.items')
                ->has('stats.shipments')
                ->has('stats.transfers')
                ->has('counts.refills')
                ->has('counts.counts'));
    }

    #[Test]
    public function a_store_admin_opens_their_own_hub_but_not_another_stores(): void
    {
        $own = Store::factory()->create();
        $other = Store::factory()->create();
        $admin = $this->user('admin', $own->id);

        $this->actingAs($admin)->get($this->hub($own))->assertOk();
        $this->actingAs($admin)->get($this->hub($other))->assertStatus(404);
    }

    #[Test]
    public function the_sidebars_store_entry_points_at_the_hub(): void
    {
        $this->assertSame("/stores/1/hub", route('store.hub', 1, false));
    }
}
