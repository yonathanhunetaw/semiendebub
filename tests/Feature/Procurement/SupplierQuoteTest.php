<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\Shop;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\SupplierQuote;
use App\Models\Procurement\Tariff;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement pipeline PP3: supplier quotes and what they cost on the shelf.
 * Procurement takes quotes while an idea is with procurement; each saves its
 * estimate from the exchange rate, the route and the tariff; costs are for
 * procurement and admins, never sellers.
 */
class SupplierQuoteTest extends TestCase
{
    use RefreshDatabase;

    private Store $own;

    private User $buyer;

    private Supplier $supplier;

    private FreightRoute $route;

    protected function setUp(): void
    {
        parent::setUp();

        $this->own = Store::factory()->create(['name' => 'Bole', 'type' => Store::TYPE_RETAIL]);
        $this->buyer = $this->user('procurement');
        $this->supplier = Supplier::factory()->create(['name' => 'Shenzhen Memory Co', 'currency' => 'USD']);
        $this->route = FreightRoute::query()->create([
            'name' => 'Guangzhou → Djibouti → Modjo', 'currency' => 'USD',
            'overseas_storage_per_cbm' => 10, 'sea_freight_per_cbm' => 200, 'insurance_pct' => 1,
            'port_clearing_per_cbm' => 4000, 'land_transport_per_cbm' => 2000, 'to_store_per_cbm' => 1000, 'is_active' => true,
        ]);
        Tariff::query()->create(['hs_code' => '85235100', 'description' => 'Flash memory', 'duty_pct' => 20, 'vat_pct' => 15, 'surtax_pct' => 10, 'withholding_pct' => 3]);
        ExchangeRate::query()->create(['currency' => 'USD', 'rate' => 150]);
    }

    private function user(string $role, ?Store $store = null): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now(), 'store_id' => $store?->id]);
        $user->assignRole($role);

        return $user;
    }

    private function on(string $app, User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => $app.'.'.config('app.system_domain')]);
        $this->actingAs($user);

        return $this;
    }

    private function idea(string $status = ProductIdea::SOURCING): ProductIdea
    {
        return ProductIdea::factory()->create(['store_id' => $this->own->id, 'status' => $status, 'target_price' => 650]);
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'supplier_id' => $this->supplier->id, 'currency' => 'USD', 'unit_price' => 2, 'moq' => 1000,
            'pieces_per_carton' => 100, 'cbm_per_carton' => 0.05, 'hs_code' => '8523.51.00', 'freight_route_id' => $this->route->id,
        ];
    }

    private function quote(ProductIdea $idea, array $overrides = []): TestResponse
    {
        return $this->on('procurement', $this->buyer)->post(route('procurement.quotes.store', $idea), $this->payload($overrides));
    }

    // ---- Taking quotes ----

    #[Test]
    public function a_quote_saves_its_estimate_from_the_latest_rate_the_route_and_the_tariff(): void
    {
        $this->quote($this->idea())->assertSessionHas('success');

        $quote = SupplierQuote::query()->sole();
        $this->assertSame(150.0, (float) $quote->exchange_rate);
        $this->assertSame('85235100', $quote->hs_code);
        $this->assertSame(1000, $quote->quantity);
        $this->assertTrue($quote->estimate['complete']);
        $this->assertSame(429.73, $quote->estimate['cost_per_piece']);
        $this->assertSame('85235100', $quote->estimate['tariff']['hs_code']);
    }

    #[Test]
    public function a_quote_without_a_rate_for_its_currency_is_refused(): void
    {
        $this->quote($this->idea(), ['currency' => 'CNY'])->assertSessionHas('error');
        $this->quote($this->idea(), ['currency' => 'CNY', 'exchange_rate' => 21])->assertSessionHas('success');

        $this->assertSame(21.0, (float) SupplierQuote::query()->sole()->exchange_rate);
    }

    #[Test]
    public function a_quote_can_override_a_route_figure(): void
    {
        $this->quote($this->idea(), ['overrides' => ['sea_freight_per_cbm' => 0, 'port_clearing_per_cbm' => '']])->assertSessionHas('success');

        $quote = SupplierQuote::query()->sole();
        $this->assertEquals(['sea_freight_per_cbm' => 0], $quote->overrides);
        $freight = collect($quote->estimate['lines'])->firstWhere('key', 'freight');
        $this->assertSame(0.0, (float) $freight['amount']);
    }

    #[Test]
    public function missing_tariff_or_size_makes_an_incomplete_estimate_not_a_guess(): void
    {
        $this->quote($this->idea(), ['hs_code' => '9999', 'cbm_per_carton' => null])->assertSessionHas('success');

        $estimate = SupplierQuote::query()->sole()->estimate;
        $this->assertFalse($estimate['complete']);
        $this->assertCount(2, $estimate['warnings']);
    }

    #[Test]
    public function quotes_are_taken_only_while_the_idea_is_with_procurement(): void
    {
        $this->quote($this->idea(ProductIdea::SCOUTED))->assertSessionHas('error');
        $this->quote($this->idea(ProductIdea::APPROVED))->assertSessionHas('error');

        $this->assertSame(0, SupplierQuote::query()->count());
    }

    #[Test]
    public function a_saved_estimate_keeps_its_figures_until_recalculated(): void
    {
        $this->quote($this->idea())->assertSessionHas('success');
        $quote = SupplierQuote::query()->sole();

        Tariff::query()->where('hs_code', '85235100')->update(['duty_pct' => 0]);
        ExchangeRate::query()->create(['currency' => 'USD', 'rate' => 160]);
        $this->assertSame(429.73, $quote->refresh()->estimate['cost_per_piece']);

        $this->on('procurement', $this->buyer)->post(route('procurement.quotes.recalculate', $quote))->assertSessionHas('success');

        $quote->refresh();
        $this->assertSame(160.0, (float) $quote->exchange_rate);
        $this->assertSame(0.0, (float) collect($quote->estimate['lines'])->firstWhere('key', 'duty')['amount']);
        $this->assertLessThan(429.73, $quote->estimate['cost_per_piece']);
    }

    #[Test]
    public function a_quote_is_edited_and_removed(): void
    {
        $this->quote($this->idea())->assertSessionHas('success');
        $quote = SupplierQuote::query()->sole();

        $this->on('procurement', $this->buyer)->put(route('procurement.quotes.update', $quote), $this->payload(['unit_price' => 1.5, 'quantity' => 2000]))
            ->assertSessionHas('success');
        $this->assertSame([1.5, 2000], [(float) $quote->refresh()->unit_price, $quote->quantity]);

        $this->on('procurement', $this->buyer)->delete(route('procurement.quotes.destroy', $quote))->assertSessionHas('success');
        $this->assertSame(0, SupplierQuote::query()->count());
    }

    // ---- Seeing costs ----

    #[Test]
    public function the_quotes_screen_shows_margins_against_the_target_and_the_market(): void
    {
        $idea = $this->idea();
        $this->verifiedMarketPrice($idea, 700);
        $this->quote($idea)->assertSessionHas('success');
        $quote = SupplierQuote::query()->sole();

        $this->on('procurement', $this->buyer)->get(route('procurement.ideas.quotes', $idea))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Procurement/Ideas/Quotes')
                ->where('canQuote', true)
                ->where('board.best', $quote->id)
                ->where('board.market.median', 700)
                ->where('board.quotes.0.margin.amount', 220.27)       // 650 − 429.73
                ->where('board.quotes.0.margin_vs_market.amount', 270.27)
                ->has('suppliers', 1)
                ->has('routes', 1));
    }

    #[Test]
    public function the_stores_admin_reads_the_quotes_in_the_admin_app(): void
    {
        $idea = $this->idea();
        $this->quote($idea);

        $this->on('admin', $this->user('admin', $this->own))->get(route('admin.ideas.quotes', $idea))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/Ideas/Quotes')->where('canQuote', false)->has('board.quotes', 1));
        $this->on('admin', $this->user('admin', Store::factory()->create()))->get(route('admin.ideas.quotes', $idea))->assertNotFound();
    }

    #[Test]
    public function sellers_never_see_costs(): void
    {
        $idea = $this->idea();
        $this->quote($idea);

        $this->on('seller', $this->user('seller', $this->own))->get(route('seller.ideas.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('ideas.0.costs', null)->where('quotesRoute', null));
        $this->on('procurement', $this->buyer)->get(route('procurement.ideas.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('ideas.0.costs.quotes', 1)->where('ideas.0.costs.best_cost_per_piece', 429.73));
    }

    // ---- Rates, routes and tariffs ----

    #[Test]
    public function procurement_sets_a_rate_and_keeps_routes(): void
    {
        $this->on('procurement', $this->buyer)->post(route('procurement.costs.rates.store'), ['currency' => 'CNY', 'rate' => 21.5])->assertSessionHas('success');
        $this->on('procurement', $this->buyer)->post(route('procurement.costs.rates.store'), ['currency' => 'ETB', 'rate' => 2])->assertSessionHasErrors('currency');
        $this->assertSame(21.5, ExchangeRate::latestFor('CNY'));

        $this->on('procurement', $this->buyer)->put(route('procurement.costs.routes.update', $this->route), [
            'name' => 'GZ → Djibouti', 'currency' => 'USD', 'overseas_storage_per_cbm' => 12, 'sea_freight_per_cbm' => 180, 'insurance_pct' => 0.5,
            'port_clearing_per_cbm' => 4000, 'land_transport_per_cbm' => 2000, 'to_store_per_cbm' => 1000, 'is_active' => true,
        ])->assertSessionHas('success');
        $this->assertSame(180.0, (float) $this->route->refresh()->sea_freight_per_cbm);

        $this->on('procurement', $this->buyer)->get(route('procurement.costs.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Procurement/Costs/Index')->has('routes', 1)->where('tariffCount', 1));
    }

    #[Test]
    public function tariffs_import_from_csv_and_a_bad_line_imports_nothing(): void
    {
        $bad = "hs_code,description,duty,excise,vat,surtax,withholding,other\n8471.30.00,Laptops,5,0,15,10,3,0\n,Nothing here,1,1,1,1,1,1";
        $this->on('procurement', $this->buyer)->post(route('procurement.tariffs.import'), ['csv' => $bad])->assertSessionHas('error');
        $this->assertSame(1, Tariff::query()->count());

        $good = "hs_code,description,duty,excise,vat,surtax,withholding,other\n8471.30.00,Laptops,5,0,15,10,3,0\n85235100,Flash memory,30,,15,10,3,0";
        $this->on('procurement', $this->buyer)->post(route('procurement.tariffs.import'), ['csv' => $good])->assertSessionHas('success');

        $this->assertSame(2, Tariff::query()->count());
        $this->assertSame(5.0, (float) Tariff::forCode('8471.30.00')->duty_pct);
        $this->assertSame(30.0, (float) Tariff::forCode('85235100')->duty_pct);
        $this->assertSame(0.0, (float) Tariff::forCode('85235100')->excise_pct);
    }

    #[Test]
    public function an_hs_code_is_kept_once_whatever_its_dots(): void
    {
        $fields = ['description' => 'Again', 'duty_pct' => 1, 'excise_pct' => 0, 'vat_pct' => 15, 'surtax_pct' => 10, 'withholding_pct' => 3, 'other_pct' => 0];

        $this->on('procurement', $this->buyer)->post(route('procurement.tariffs.store'), ['hs_code' => '8523.51.00'] + $fields)->assertSessionHasErrors('hs_code');
        $this->on('procurement', $this->buyer)->post(route('procurement.tariffs.store'), ['hs_code' => '8471 30 00'] + $fields)->assertSessionHas('success');

        $this->assertNotNull(Tariff::query()->where('hs_code', '84713000')->first());
    }

    #[Test]
    public function a_tariff_is_found_edited_and_removed(): void
    {
        $fields = ['description' => 'Flash memory', 'duty_pct' => 1, 'excise_pct' => 0, 'vat_pct' => 15, 'surtax_pct' => 10, 'withholding_pct' => 3, 'other_pct' => 0];
        $this->on('procurement', $this->buyer)->post(route('procurement.tariffs.store'), ['hs_code' => '8471.30.00', 'description' => 'Laptops'] + $fields)->assertSessionHas('success');
        $flash = Tariff::forCode('85235100');
        $laptops = Tariff::forCode('84713000');

        $this->on('procurement', $this->buyer)->get(route('procurement.tariffs.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Procurement/Tariffs/Index')->has('tariffs', 2)->where('pagination.total', 2));
        $this->on('procurement', $this->buyer)->get(route('procurement.tariffs.index', ['search' => '8471.3']))
            ->assertInertia(fn (Assert $page) => $page->has('tariffs', 1)->where('tariffs.0.id', $laptops->id)->where('filters.search', '8471.3'));
        $this->on('procurement', $this->buyer)->get(route('procurement.tariffs.index', ['search' => 'laptop']))
            ->assertInertia(fn (Assert $page) => $page->has('tariffs', 1)->where('tariffs.0.hs_code', '84713000'));

        $this->on('procurement', $this->buyer)->put(route('procurement.tariffs.update', $flash), ['hs_code' => '8471.30.00'] + $fields)
            ->assertSessionHasErrors('hs_code');
        $this->on('procurement', $this->buyer)->put(route('procurement.tariffs.update', $flash), ['hs_code' => '8523.51.00', 'duty_pct' => 30] + $fields)
            ->assertSessionHas('success', 'HS 85235100 saved. Existing quotes keep their estimate until recalculated.');
        $this->assertSame(30.0, (float) $flash->refresh()->duty_pct);
        $this->assertSame($this->buyer->id, (int) $flash->updated_by);

        $this->on('procurement', $this->buyer)->delete(route('procurement.tariffs.destroy', $laptops))
            ->assertSessionHas('success', 'HS 84713000 removed.');
        $this->assertNull(Tariff::forCode('84713000'));
    }

    #[Test]
    public function procurement_adds_a_freight_route(): void
    {
        $route = ['name' => 'Yiwu → Djibouti', 'origin' => 'Yiwu', 'currency' => 'USD', 'overseas_storage_per_cbm' => 10, 'sea_freight_per_cbm' => 150, 'insurance_pct' => 0.5,
            'port_clearing_per_cbm' => 4000, 'land_transport_per_cbm' => 2000, 'to_store_per_cbm' => 1000, 'transit_days' => 40, 'is_active' => true];

        $this->on('procurement', $this->buyer)->post(route('procurement.costs.routes.store'), ['currency' => 'XYZ'] + $route)->assertSessionHasErrors('currency');
        $this->on('procurement', $this->buyer)->post(route('procurement.costs.routes.store'), ['insurance_pct' => 101] + $route)->assertSessionHasErrors('insurance_pct');
        $this->on('procurement', $this->buyer)->post(route('procurement.costs.routes.store'), $route)->assertSessionHas('success', 'Route Yiwu → Djibouti added.');

        $saved = FreightRoute::query()->where('name', 'Yiwu → Djibouti')->sole();
        $this->assertSame($this->buyer->id, (int) $saved->created_by);
        $this->assertSame(150.0, (float) $saved->sea_freight_per_cbm);
    }

    #[Test]
    public function the_tariff_and_cost_pages_are_closed_to_a_store_admin(): void
    {
        $storeAdmin = $this->user('admin', $this->own);

        $this->on('procurement', $storeAdmin)->get(route('procurement.tariffs.index'))->assertForbidden();
        $this->on('procurement', $storeAdmin)->get(route('procurement.costs.index'))->assertForbidden();
    }

    #[Test]
    public function an_item_keeps_its_hs_code_as_digits(): void
    {
        $item = Item::factory()->create(['status' => 'active']);

        $this->on('admin', $this->user('admin'))->put(route('admin.items.setup.basics', $item), [
            'product_name' => $item->product_name, 'item_category_id' => $item->item_category_id, 'status' => 'active', 'hs_code' => '8523.51.00',
        ])->assertSessionHasNoErrors();

        $this->assertSame('85235100', $item->refresh()->hs_code);
    }

    private function verifiedMarketPrice(ProductIdea $idea, float $price): void
    {
        $check = PriceCheck::query()->create(['store_id' => $this->own->id, 'product_idea_id' => $idea->id, 'status' => PriceCheck::CLOSED]);
        $shop = Shop::factory()->create();
        $check->observations()->create([
            'shop_id' => $shop->id, 'recorded_by' => $this->user('seller', $this->own)->id, 'observed_on' => now()->toDateString(),
            'pack_type' => 'piece', 'pieces_per_pack' => 1, 'min_qty' => 1, 'price' => $price, 'price_per_piece' => $price,
            'verified_by' => $this->user('store_manager', $this->own)->id, 'verified_at' => now(),
        ]);
    }
}
