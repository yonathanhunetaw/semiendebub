<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin\BusinessSetting;
use App\Models\Auth\User;
use App\Models\Store\Store;
use App\Services\Admin\BusinessRules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Settings → Business rules: the .env-only rules, set by a global admin in the app. */
class BusinessRulesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $this->admin->assignRole('admin');
    }

    #[Test]
    public function a_global_admin_sees_every_rule_with_its_default(): void
    {
        $this->actingAs($this->admin)->get(route('admin.settings.rules'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Settings/BusinessRules')
                ->has('rules', count(BusinessRules::RULES))
                ->where('rules', fn ($rules) => collect($rules)->firstWhere('key', 'cash_flag_days')['default'] === 2
                    && collect($rules)->firstWhere('key', 'unpaid_reservation_minutes')['value'] === (int) config('inventory.unpaid_reservation_minutes'))
                ->has('elsewhere', 3));
    }

    #[Test]
    public function a_store_admin_cannot_open_or_change_them(): void
    {
        $store = Store::factory()->create();
        $storeAdmin = User::factory()->create(['role' => 'admin', 'store_id' => $store->id]);
        $storeAdmin->assignRole('admin');

        $this->actingAs($storeAdmin)->get(route('admin.settings.rules'))->assertForbidden();
        $this->actingAs($storeAdmin)->put(route('admin.settings.rules.update'), ['cash_flag_days' => 9])->assertForbidden();
        $this->assertSame(0, BusinessSetting::query()->count());
    }

    #[Test]
    public function a_saved_rule_replaces_its_config_value_and_a_default_stays_unsaved(): void
    {
        $default = (int) config('inventory.unpaid_reservation_minutes');

        $this->actingAs($this->admin)->put(route('admin.settings.rules.update'), [
            'cash_flag_days' => 5,
            'unpaid_reservation_minutes' => $default,
            'auto_replenishment' => false,
            'same_day_promise' => '  In the shop today  ',
        ])->assertSessionHasNoErrors()->assertSessionHas('success');

        $row = BusinessSetting::query()->sole();
        $this->assertSame(5, $row->cash_flag_days);
        // Equal to the default: stored as "follow .env".
        $this->assertNull($row->unpaid_reservation_minutes);
        $this->assertFalse($row->auto_replenishment);
        $this->assertSame($this->admin->id, $row->updated_by);

        $this->assertSame(5, config('payments.cash_flag_days'));
        $this->assertFalse(config('inventory.auto_replenishment.enabled'));
        $this->assertSame('In the shop today', config('inventory.same_day_promise'));
        $this->assertSame($default, config('inventory.unpaid_reservation_minutes'));
    }

    #[Test]
    public function the_saved_rules_apply_on_the_next_request_and_reset_back_to_the_default(): void
    {
        BusinessSetting::query()->create(['cash_flag_days' => 7, 'storefront_per_page' => 12]);
        app()->forgetInstance(BusinessRules::class);
        cache()->flush();

        // A fresh boot of the rules, as on the next request.
        app(BusinessRules::class)->apply();
        $this->assertSame(7, config('payments.cash_flag_days'));
        $this->assertSame(12, config('storefront.per_page'));

        $this->actingAs($this->admin)->put(route('admin.settings.rules.update'), ['cash_flag_days' => null])->assertSessionHasNoErrors();

        $this->assertNull(BusinessSetting::query()->sole()->cash_flag_days);
        $this->assertSame(2, config('payments.cash_flag_days'));
        // A rule not sent is left alone.
        $this->assertSame(12, config('storefront.per_page'));
    }

    #[Test]
    public function values_outside_their_range_are_refused(): void
    {
        $this->actingAs($this->admin)->put(route('admin.settings.rules.update'), [
            'cash_flag_days' => 0,
            'unpaid_reservation_minutes' => 5,
            'storefront_per_page' => 'many',
            'delayed_promise' => str_repeat('x', 61),
        ])->assertSessionHasErrors(['cash_flag_days', 'unpaid_reservation_minutes', 'storefront_per_page', 'delayed_promise']);

        $this->assertSame(0, BusinessSetting::query()->count());
    }

    #[Test]
    public function the_settings_tab_bar_lists_business_rules(): void
    {
        $this->actingAs($this->admin)->get(route('admin.settings'))->assertOk();
        $this->assertStringContainsString('admin.settings.rules', (string) file_get_contents(resource_path('js/Components/Navigation/Admin/adminSections.ts')));
    }
}
