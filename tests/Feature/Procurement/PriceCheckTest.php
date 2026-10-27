<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\PriceObservation;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\Shop;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement pipeline PP2: price checks. A store admin sends an idea to price
 * check; the store's sellers write down what its "check" shops charge, per
 * pack and quantity; someone else verifies each price; only verified prices
 * count, and only they let the idea move to "prices in".
 */
class PriceCheckTest extends TestCase
{
    use RefreshDatabase;

    private Store $own;

    private Store $other;

    private Shop $merkato;

    private Shop $avoided;

    private User $storeAdmin;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        $this->own = Store::factory()->create(['name' => 'Bole', 'type' => Store::TYPE_RETAIL]);
        $this->other = Store::factory()->create(['name' => 'Piassa', 'type' => Store::TYPE_RETAIL]);

        $this->merkato = Shop::factory()->create(['name' => 'Merkato Electronics']);
        $this->avoided = Shop::factory()->create(['name' => 'Cousin Shop']);
        Shop::factory()->create(['name' => 'Unlisted']);
        $this->merkato->stores()->attach($this->own->id, ['mode' => Shop::CHECK]);
        $this->avoided->stores()->attach($this->own->id, ['mode' => Shop::AVOID]);

        $this->storeAdmin = $this->user('admin', $this->own);
        $this->storeAdmin->assignRole('seller'); // records prices in the seller app, which a store admin enters when ticked for it
        $this->seller = $this->user('seller', $this->own);
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

    /** An idea of the own store, sent to price check by its admin. */
    private function scouting(array $check = []): array
    {
        $idea = ProductIdea::factory()->create(['store_id' => $this->own->id, 'target_price' => 650]);

        $this->on('admin', $this->storeAdmin)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTING] + $check)
            ->assertSessionHas('success');

        return [$idea->refresh(), PriceCheck::query()->where('product_idea_id', $idea->id)->sole()];
    }

    private function record(User $by, PriceCheck $check, array $data = []): TestResponse
    {
        return $this->on('seller', $by)->post(route('seller.price_checks.record', $check), $data + [
            'shop_id' => $this->merkato->id, 'pack_type' => 'piece', 'price' => 600,
        ]);
    }

    private function observation(PriceCheck $check, ?User $by = null, array $data = []): PriceObservation
    {
        $this->record($by ?? $this->seller, $check, $data)->assertSessionHas('success');

        return PriceObservation::query()->latest('id')->firstOrFail();
    }

    // ---- Opening ----

    #[Test]
    public function sending_an_idea_to_price_check_opens_a_check_for_its_store(): void
    {
        [, $check] = $this->scouting(['shops_wanted' => 5, 'due_on' => now()->addDays(3)->toDateString(), 'assignee_ids' => [$this->seller->id]]);

        $this->assertSame($this->own->id, (int) $check->store_id);
        $this->assertSame(5, $check->shops_wanted);
        $this->assertSame([$this->seller->id], $check->assignees()->pluck('users.id')->all());
        $this->assertSame(PriceCheck::OPEN, $check->status);
    }

    #[Test]
    public function a_global_idea_names_the_store_whose_sellers_check(): void
    {
        $idea = ProductIdea::factory()->create(['store_id' => null, 'target_price' => 650]);
        $global = $this->user('admin');

        $this->on('admin', $global)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTING])->assertSessionHas('error');
        $this->on('admin', $global)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTING, 'store_id' => $this->other->id])
            ->assertSessionHas('success');

        $this->assertSame($this->other->id, (int) PriceCheck::query()->sole()->store_id);
    }

    #[Test]
    public function only_the_stores_own_sellers_can_be_named(): void
    {
        $elsewhere = $this->user('seller', $this->other);
        $idea = ProductIdea::factory()->create(['store_id' => $this->own->id, 'target_price' => 650]);

        $this->on('admin', $this->storeAdmin)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTING, 'assignee_ids' => [$elsewhere->id]])
            ->assertSessionHas('error');

        $this->assertSame(ProductIdea::SUGGESTED, $idea->refresh()->status);
        $this->assertSame(0, PriceCheck::query()->count());
    }

    #[Test]
    public function an_admin_opens_a_check_on_an_item_we_already_sell_but_only_for_their_store(): void
    {
        $item = Item::factory()->create(['status' => 'active']);

        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.store'), ['item_id' => $item->id, 'store_id' => $this->other->id])
            ->assertSessionHas('error');
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.store'), ['item_id' => $item->id, 'store_id' => $this->own->id])
            ->assertRedirect();

        $check = PriceCheck::query()->sole();
        $this->assertSame([$item->id, $this->own->id], [(int) $check->item_id, (int) $check->store_id]);

        // One open check per item and store.
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.store'), ['item_id' => $item->id, 'store_id' => $this->own->id])
            ->assertSessionHas('error');
    }

    // ---- Recording ----

    #[Test]
    public function a_seller_writes_down_a_carton_price_and_it_is_kept_per_piece(): void
    {
        [, $check] = $this->scouting();

        $row = $this->observation($check, $this->seller, ['pack_type' => 'carton', 'pieces_per_pack' => 24, 'min_qty' => 2, 'price' => 1200]);

        $this->assertSame(50.0, (float) $row->price_per_piece);
        $this->assertSame([24, 2], [$row->pieces_per_pack, $row->min_qty]);
        $this->assertSame(PriceObservation::PENDING, $row->state());
    }

    #[Test]
    public function an_avoided_or_unlisted_shop_is_refused(): void
    {
        [, $check] = $this->scouting();

        $this->record($this->seller, $check, ['shop_id' => $this->avoided->id])->assertSessionHas('error');
        $this->record($this->seller, $check, ['shop_id' => Shop::query()->where('name', 'Unlisted')->value('id')])->assertSessionHas('error');

        $this->assertSame(0, PriceObservation::query()->count());
    }

    #[Test]
    public function the_same_price_at_the_same_shop_is_written_down_once(): void
    {
        [, $check] = $this->scouting();
        $this->observation($check);

        $this->record($this->user('seller', $this->own), $check)->assertSessionHas('error');
        // Another quantity at the same shop is a new price.
        $this->record($this->seller, $check, ['min_qty' => 10, 'price' => 560])->assertSessionHas('success');

        $this->assertSame(2, PriceObservation::query()->count());
    }

    #[Test]
    public function a_packet_needs_its_piece_count_and_a_price_must_be_positive(): void
    {
        [, $check] = $this->scouting();

        $this->record($this->seller, $check, ['pack_type' => 'packet', 'price' => 0])->assertSessionHasErrors(['pieces_per_pack', 'price']);
    }

    #[Test]
    public function when_sellers_are_named_only_they_see_and_fill_the_check(): void
    {
        $named = $this->user('seller', $this->own);
        [, $check] = $this->scouting(['assignee_ids' => [$named->id]]);

        $this->on('seller', $this->seller)->get(route('seller.price_checks.show', $check))->assertNotFound();
        $this->record($this->seller, $check)->assertNotFound();
        $this->record($named, $check)->assertSessionHas('success');
    }

    #[Test]
    public function an_idea_card_does_not_point_a_seller_at_a_check_that_names_others(): void
    {
        $named = $this->user('seller', $this->own);
        [, $check] = $this->scouting(['assignee_ids' => [$named->id]]);

        $this->on('seller', $this->seller)->get(route('seller.ideas.index'))
            ->assertInertia(fn (Assert $page) => $page->where('ideas.0.checks', []));
        $this->on('seller', $named)->get(route('seller.ideas.index'))
            ->assertInertia(fn (Assert $page) => $page->where('ideas.0.checks.0.id', $check->id));
    }

    #[Test]
    public function another_stores_seller_cannot_see_or_fill_the_check(): void
    {
        [, $check] = $this->scouting();
        $elsewhere = $this->user('seller', $this->other);

        $this->on('seller', $elsewhere)->get(route('seller.price_checks.show', $check))->assertNotFound();
        $this->record($elsewhere, $check)->assertNotFound();
    }

    #[Test]
    public function a_closed_check_takes_no_more_prices(): void
    {
        [, $check] = $this->scouting();
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.close', $check))->assertSessionHas('success');

        $this->record($this->seller, $check)->assertSessionHas('error');
    }

    // ---- Verifying ----

    #[Test]
    public function whoever_wrote_a_price_down_never_verifies_it(): void
    {
        [, $check] = $this->scouting();
        $row = $this->observation($check, $this->storeAdmin);

        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.verify', $row))->assertSessionHas('error');

        $this->assertSame(PriceObservation::PENDING, $row->refresh()->state());
    }

    #[Test]
    public function a_seller_cannot_verify_but_the_store_manager_and_admin_can(): void
    {
        [, $check] = $this->scouting();
        $first = $this->observation($check);
        $second = $this->observation($check, $this->seller, ['min_qty' => 10, 'price' => 560]);
        $manager = $this->user('store_manager', $this->own);

        $this->on('seller', $this->user('seller', $this->own))->post(route('seller.price_checks.verify', $first))->assertSessionHas('error');
        $this->on('seller', $manager)->post(route('seller.price_checks.verify', $first))->assertSessionHas('success');
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.verify', $second))->assertSessionHas('success');

        $this->assertSame([$manager->id, $this->storeAdmin->id], [(int) $first->refresh()->verified_by, (int) $second->refresh()->verified_by]);
    }

    #[Test]
    public function a_price_is_settled_once_and_rejecting_needs_a_reason(): void
    {
        [, $check] = $this->scouting();
        $row = $this->observation($check);

        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.reject', $row), ['reason' => ''])->assertSessionHasErrors('reason');
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.verify', $row))->assertSessionHas('success');
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.reject', $row), ['reason' => 'Wrong shop'])->assertSessionHas('error');
        $this->on('admin', $this->user('admin'))->post(route('admin.price_checks.verify', $row))->assertSessionHas('error');

        $this->assertSame(PriceObservation::VERIFIED, $row->refresh()->state());
    }

    #[Test]
    public function another_stores_admin_cannot_verify(): void
    {
        [, $check] = $this->scouting();
        $row = $this->observation($check);

        $this->on('admin', $this->user('admin', $this->other))->post(route('admin.price_checks.verify', $row))->assertNotFound();

        $this->assertSame(PriceObservation::PENDING, $row->refresh()->state());
    }

    // ---- Seeing ----

    #[Test]
    public function a_seller_sees_only_the_prices_they_wrote_and_no_summary(): void
    {
        [, $check] = $this->scouting();
        $this->observation($check, $this->seller);
        $this->observation($check, $this->user('seller', $this->own), ['min_qty' => 10, 'price' => 560]);

        $this->on('seller', $this->seller)->get(route('seller.price_checks.show', $check))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Seller/PriceChecks/Show')
                ->has('check.observations', 1)
                ->where('check.observations.0.price', 600)
                ->where('check.summary', null)
                ->where('check.shops_done', 1)
                ->where('check.can_record', true));
    }

    #[Test]
    public function the_admin_sees_every_price_and_a_summary_of_verified_ones_only(): void
    {
        [$idea, $check] = $this->scouting();
        $a = $this->observation($check, $this->seller, ['price' => 600]);
        $this->observation($check, $this->seller, ['pack_type' => 'carton', 'pieces_per_pack' => 10, 'price' => 5000]);
        $this->on('admin', $this->storeAdmin)->post(route('admin.price_checks.verify', $a));

        $this->on('admin', $this->storeAdmin)->get(route('admin.price_checks.show', $check))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/PriceChecks/Show')
                ->has('check.observations', 2)
                ->where('check.summary.prices', 1)
                ->where('check.summary.lowest', 600)
                ->where('check.summary.median', 600));

        // Sellers see the idea's status, not the prices.
        $this->on('seller', $this->seller)->get(route('seller.ideas.index'))
            ->assertInertia(fn (Assert $page) => $page->where('ideas.0.prices', null)->where('ideas.0.checks.0.id', $check->id));
        $this->on('procurement', $this->user('procurement'))->get(route('procurement.ideas.index'))
            ->assertInertia(fn (Assert $page) => $page->where('ideas.0.id', $idea->id)->where('ideas.0.prices.lowest', 600));
    }

    #[Test]
    public function the_summary_takes_the_median_per_piece_and_groups_by_quantity(): void
    {
        [, $check] = $this->scouting();
        $manager = $this->user('store_manager', $this->own);
        $shop2 = Shop::factory()->create();
        $shop2->stores()->attach($this->own->id, ['mode' => Shop::CHECK]);

        foreach ([
            ['price' => 600],
            ['price' => 700, 'shop_id' => $shop2->id],
            ['pack_type' => 'carton', 'pieces_per_pack' => 10, 'price' => 5000],
        ] as $data) {
            $row = $this->observation($check, $this->seller, $data);
            $this->on('seller', $manager)->post(route('seller.price_checks.verify', $row))->assertSessionHas('success');
        }

        $summary = \App\Services\Procurement\PriceCheckService::summary($check->refresh()->observations);

        $this->assertSame(2, $summary['shops']);
        $this->assertSame(500.0, $summary['lowest']);
        $this->assertSame(600.0, $summary['median']);
        $this->assertSame([1, 10], array_column($summary['tiers'], 'from_pieces'));
        $this->assertSame(650.0, $summary['tiers'][0]['median']);
    }

    // ---- The idea moves on only with verified prices ----

    #[Test]
    public function prices_in_needs_a_verified_price_and_closes_the_check(): void
    {
        [$idea, $check] = $this->scouting();
        $row = $this->observation($check);

        $this->on('admin', $this->storeAdmin)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTED])->assertSessionHas('error');

        $this->on('admin', $this->user('store_manager', $this->own))->post(route('admin.price_checks.verify', $row));
        $this->on('seller', $this->user('store_manager', $this->own))->post(route('seller.price_checks.verify', $row))->assertSessionHas('success');
        $this->on('admin', $this->storeAdmin)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTED])->assertSessionHas('success');

        $this->assertSame(PriceCheck::CLOSED, $check->refresh()->status);

        // More prices wanted: the same check reopens.
        $this->on('admin', $this->storeAdmin)->post(route('admin.ideas.move', $idea), ['to' => ProductIdea::SCOUTING])->assertSessionHas('success');
        $this->assertSame(PriceCheck::OPEN, $check->refresh()->status);
        $this->assertSame(1, PriceCheck::query()->count());
    }

    // ---- Shops ----

    #[Test]
    public function a_store_admin_sets_which_shops_their_store_checks_and_no_other_stores(): void
    {
        $shop = Shop::factory()->create();

        $this->on('admin', $this->storeAdmin)->put(route('admin.shops.mode', $shop), ['store_id' => $this->own->id, 'mode' => Shop::AVOID])
            ->assertSessionHas('success');
        $this->on('admin', $this->storeAdmin)->put(route('admin.shops.mode', $shop), ['store_id' => $this->other->id, 'mode' => Shop::CHECK])
            ->assertForbidden();
        $this->on('admin', $this->storeAdmin)->put(route('admin.shops.mode', $this->merkato), ['store_id' => $this->own->id, 'mode' => 'none'])
            ->assertSessionHas('success');

        $this->assertSame(Shop::AVOID, $shop->stores()->firstWhere('stores.id', $this->own->id)?->pivot->mode);
        $this->assertSame(0, $shop->stores()->where('stores.id', $this->other->id)->count());
        $this->assertSame(0, $this->merkato->stores()->count());
    }

    #[Test]
    public function a_store_admin_adds_a_shop_and_it_is_on_their_list(): void
    {
        $this->on('admin', $this->storeAdmin)->post(route('admin.shops.store'), ['name' => 'Bole Phone House', 'area' => 'Bole', 'is_active' => true])
            ->assertSessionHas('success');

        $shop = Shop::query()->where('name', 'Bole Phone House')->sole();
        $this->assertSame(Shop::CHECK, $shop->stores()->firstWhere('stores.id', $this->own->id)?->pivot->mode);

        $this->on('admin', $this->storeAdmin)->get(route('admin.shops.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/Shops/Index')->where('canSetMode', true));

        $this->on('admin', $this->storeAdmin)->put(route('admin.shops.update', $shop), ['name' => '', 'is_active' => true])->assertSessionHasErrors('name');
        $this->on('admin', $this->storeAdmin)->put(route('admin.shops.update', $shop), ['name' => 'Bole Phone House 2', 'area' => 'Bole', 'phone' => '0911', 'is_active' => false])
            ->assertSessionHas('success', 'Bole Phone House 2 saved.');
        $shop->refresh();
        $this->assertSame(['Bole Phone House 2', '0911', false], [$shop->name, $shop->phone, (bool) $shop->is_active]);
        $this->assertSame(Shop::CHECK, $shop->stores()->firstWhere('stores.id', $this->own->id)?->pivot->mode, 'Editing keeps the store’s mark.');
    }

    #[Test]
    public function a_checks_due_day_is_on_the_sellers_calendar_but_not_another_stores(): void
    {
        $due = now()->addDays(2)->toDateString();
        $this->scouting(['due_on' => $due]);

        $this->on('seller', $this->seller)
            ->getJson(route('seller.calendar.feed', ['from' => $due, 'to' => $due, 'sources' => ['price_checks']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.start', $due);

        $this->on('seller', $this->user('seller', $this->other))
            ->getJson(route('seller.calendar.feed', ['from' => $due, 'to' => $due, 'sources' => ['price_checks']]))
            ->assertOk()
            ->assertJsonCount(0, 'events');
    }

    #[Test]
    public function the_lists_open_for_seller_and_admin(): void
    {
        [, $check] = $this->scouting();

        $this->on('seller', $this->seller)->get(route('seller.price_checks.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Seller/PriceChecks/Index')->where('checks.0.id', $check->id));
        $this->on('admin', $this->storeAdmin)->get(route('admin.price_checks.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/PriceChecks/Index')->where('checks.0.id', $check->id)->where('counts.open', 1));
    }
}
