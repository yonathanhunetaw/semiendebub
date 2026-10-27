<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Support\StockKeepingRoutes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A seller who is also ticked as a stock keeper does stock keeping inside the
 * seller app, under /stock: the same routes, controllers and pages as the stock
 * keeper app, acting as a stock keeper.
 */
class StockKeepingInSellerAppTest extends TestCase
{
    use RefreshDatabase;

    private string $seller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seller = 'http://seller.'.config('app.system_domain');
    }

    private function user(string $role, array $also = []): User
    {
        $user = User::factory()->create(['role' => $role]);
        $user->syncRoles([$role, ...$also]);

        return $user->fresh();
    }

    #[Test]
    public function a_plain_seller_cannot_open_stock_keeping(): void
    {
        $this->actingAs($this->user('seller'))->get("{$this->seller}/stock/dashboard")->assertForbidden();
    }

    #[Test]
    public function a_seller_ticked_as_a_stock_keeper_opens_it_and_is_a_stock_keeper_there(): void
    {
        $both = $this->user('seller', ['stock_keeper']);

        $this->actingAs($both)->get("{$this->seller}/stock/dashboard")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('StockKeeper/Dashboard/index')->where('auth.user.role_key', 'stock_keeper'));

        // Everywhere else in the seller app they are still a seller.
        $this->actingAs($both)->get("{$this->seller}/dashboard")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('auth.user.role_key', 'seller'));
    }

    #[Test]
    public function the_stock_keeper_app_is_unchanged_and_others_stay_out_of_stock_keeping(): void
    {
        $host = 'http://stockkeeper.'.config('app.system_domain');

        $this->actingAs($this->user('stock_keeper'))->get("{$host}/dashboard")->assertOk();
        $this->actingAs($this->user('delivery'))->get("{$this->seller}/stock/dashboard")->assertForbidden();
    }

    #[Test]
    public function the_seller_more_page_lists_stock_keeping_only_for_those_who_hold_the_role(): void
    {
        $this->actingAs($this->user('seller'))->get("{$this->seller}/menu")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('auth.user.roles', ['seller']));

        $this->actingAs($this->user('seller', ['stock_keeper']))->get("{$this->seller}/menu")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('auth.user.roles', fn ($roles) => collect($roles)->contains('stock_keeper')));
    }

    #[Test]
    public function a_sibling_link_stays_in_the_app_the_person_is_in(): void
    {
        $inSeller = new LaravelRoute('GET', '/stock/stocktakes', fn () => null);
        $inSeller->name('seller.stock.stocktakes.index');
        $request = Request::create("{$this->seller}/stock/stocktakes");
        $request->setRouteResolver(fn () => $inSeller);
        $this->app->instance('request', $request);

        $this->assertSame('seller.stock.stocktakes.show', StockKeepingRoutes::name('stock_keeper.stocktakes.show'));

        $inKeeper = new LaravelRoute('GET', '/stocktakes', fn () => null);
        $inKeeper->name('stock_keeper.stocktakes.index');
        $request = Request::create('http://stockkeeper.'.config('app.system_domain').'/stocktakes');
        $request->setRouteResolver(fn () => $inKeeper);
        $this->app->instance('request', $request);

        $this->assertSame('stock_keeper.stocktakes.show', StockKeepingRoutes::name('stock_keeper.stocktakes.show'));
    }

    #[Test]
    public function every_stock_keeping_screen_opens_in_the_seller_app_without_an_error(): void
    {
        $both = $this->user('seller', ['stock_keeper']);
        $opened = 0;
        $broken = [];

        foreach (Route::getRoutes()->getRoutesByName() as $name => $route) {
            if (! str_starts_with($name, 'seller.stock.') || ! in_array('GET', $route->methods(), true) || $route->parameterNames() !== []) {
                continue;
            }

            $status = $this->actingAs($both)->get("{$this->seller}/".$route->uri())->status();
            $opened++;

            if ($status >= 400) {
                $broken[] = "{$name} -> {$status}";
            }
        }

        $this->assertGreaterThan(8, $opened, 'the stock keeping screens are mounted under /stock');
        $this->assertSame([], $broken);
    }

    #[Test]
    public function the_stock_keeping_routes_exist_in_both_apps_with_the_same_shape(): void
    {
        $names = collect(Route::getRoutes()->getRoutesByName())->keys();
        $keeper = $names->filter(fn ($n) => str_starts_with($n, 'stock_keeper.') && ! preg_match('/^stock_keeper\.(welcome|login|guide|guide\.world|calendar|work)/', $n))
            ->map(fn ($n) => substr($n, strlen('stock_keeper.')));
        $inSeller = $names->filter(fn ($n) => str_starts_with($n, 'seller.stock.'))->map(fn ($n) => substr($n, strlen('seller.stock.')));

        $this->assertEqualsCanonicalizing($keeper->all(), $inSeller->all());
    }
}
