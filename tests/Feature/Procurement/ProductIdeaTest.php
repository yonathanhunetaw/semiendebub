<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Procurement\ProductIdea;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement pipeline PP1: product ideas. Suggested on the store side or by
 * procurement, sent to price check by the store's admin, sent to procurement
 * and approved by a global admin. Rejecting needs a reason.
 */
class ProductIdeaTest extends TestCase
{
    use RefreshDatabase;

    private Store $own;

    private Store $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->own = Store::factory()->create(['name' => 'Bole', 'type' => Store::TYPE_RETAIL]);
        $this->other = Store::factory()->create(['name' => 'Piassa', 'type' => Store::TYPE_RETAIL]);
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

    private function idea(?Store $store, string $status = ProductIdea::SUGGESTED, array $attributes = []): ProductIdea
    {
        return ProductIdea::factory()->create(['store_id' => $store?->id, 'status' => $status] + $attributes);
    }

    private function move(string $app, User $user, ProductIdea $idea, string $to, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->on($app, $user)->post(route("{$app}.ideas.move", $idea), ['to' => $to] + $extra);
    }

    // ---- Suggesting ----

    #[Test]
    public function a_seller_suggests_for_their_own_store_whatever_store_they_send(): void
    {
        $seller = $this->user('seller', $this->own);

        $this->on('seller', $seller)->post(route('seller.ideas.store'), [
            'name' => 'SanDisk 64 GB flash drive', 'reason' => 'Customers ask weekly', 'target_price' => 650, 'store_id' => $this->other->id,
        ])->assertSessionHas('success');

        $idea = ProductIdea::query()->sole();
        $this->assertSame($this->own->id, (int) $idea->store_id);
        $this->assertSame(ProductIdea::SOURCE_STORE, $idea->source);
        $this->assertSame(ProductIdea::SUGGESTED, $idea->status);
        $this->assertSame(650.0, (float) $idea->target_price);
        $this->assertSame([null, ProductIdea::SUGGESTED], [$idea->events->first()->from_status, $idea->events->first()->to_status]);
    }

    #[Test]
    public function a_seller_with_no_store_cannot_suggest(): void
    {
        $this->on('seller', $this->user('seller'))->post(route('seller.ideas.store'), ['name' => 'Mouse'])->assertSessionHas('error');

        $this->assertSame(0, ProductIdea::query()->count());
    }

    #[Test]
    public function a_store_admin_suggests_only_for_a_store_they_run(): void
    {
        $storeAdmin = $this->user('admin', $this->own);

        $this->on('admin', $storeAdmin)->post(route('admin.ideas.store'), ['name' => 'Mouse', 'store_id' => $this->other->id])
            ->assertSessionHas('error');
        $this->on('admin', $storeAdmin)->post(route('admin.ideas.store'), ['name' => 'Mouse'])->assertSessionHas('success');

        $this->assertSame([$this->own->id], ProductIdea::query()->pluck('store_id')->map(fn ($id) => (int) $id)->all());
    }

    #[Test]
    public function procurement_raises_an_idea_for_every_store_or_for_one(): void
    {
        $buyer = $this->user('procurement');

        $this->on('procurement', $buyer)->post(route('procurement.ideas.store'), ['name' => 'Have you considered USB-C hubs?'])
            ->assertSessionHas('success');
        $this->on('procurement', $buyer)->post(route('procurement.ideas.store'), ['name' => 'Label printer', 'store_id' => $this->own->id])
            ->assertSessionHas('success');

        $ideas = ProductIdea::query()->orderBy('id')->get();
        $this->assertSame([ProductIdea::SOURCE_PROCUREMENT, ProductIdea::SOURCE_PROCUREMENT], $ideas->pluck('source')->all());
        $this->assertSame([null, $this->own->id], $ideas->pluck('store_id')->map(fn ($id) => $id === null ? null : (int) $id)->all());
    }

    #[Test]
    public function a_suggestion_needs_a_name_and_a_sane_price(): void
    {
        $this->on('seller', $this->user('seller', $this->own))
            ->post(route('seller.ideas.store'), ['name' => '', 'target_price' => -5])
            ->assertSessionHasErrors(['name', 'target_price']);
    }

    // ---- The whole road ----

    #[Test]
    public function an_idea_goes_from_suggested_to_approved_with_the_right_person_at_each_step(): void
    {
        $storeAdmin = $this->user('admin', $this->own);
        $global = $this->user('admin');
        $idea = $this->idea($this->own);

        // Price check needs the store's selling price.
        $this->move('admin', $storeAdmin, $idea, ProductIdea::SCOUTING)->assertSessionHas('error');
        $this->move('admin', $storeAdmin, $idea, ProductIdea::SCOUTING, ['target_price' => 650])->assertSessionHas('success');
        $this->assertSame(650.0, (float) $idea->refresh()->target_price);

        // Prices in needs a price someone else verified (PriceCheckTest has the details).
        $this->move('admin', $storeAdmin, $idea, ProductIdea::SCOUTED)->assertSessionHas('error');
        $this->verifiedPrice($idea);
        $this->move('admin', $storeAdmin, $idea, ProductIdea::SCOUTED)->assertSessionHas('success');

        // Sending it to procurement is a global admin's step.
        $this->move('admin', $storeAdmin, $idea, ProductIdea::SOURCING)->assertSessionHas('error');
        $this->assertSame(ProductIdea::SCOUTED, $idea->refresh()->status);
        $this->move('admin', $global, $idea, ProductIdea::SOURCING)->assertSessionHas('success');

        $this->move('admin', $storeAdmin, $idea, ProductIdea::APPROVED)->assertSessionHas('error');
        $this->move('admin', $global, $idea, ProductIdea::APPROVED)->assertSessionHas('success');

        $this->assertSame(ProductIdea::APPROVED, $idea->refresh()->status);
        $this->assertSame(
            [ProductIdea::SCOUTING, ProductIdea::SCOUTED, ProductIdea::SOURCING, ProductIdea::APPROVED],
            $idea->events()->whereNotNull('from_status')->pluck('to_status')->all(),
        );
    }

    #[Test]
    public function scouted_can_go_back_to_price_check_for_more_prices(): void
    {
        $idea = $this->idea($this->own, ProductIdea::SCOUTED, ['target_price' => 650]);

        $this->move('admin', $this->user('admin', $this->own), $idea, ProductIdea::SCOUTING)->assertSessionHas('success');

        $this->assertSame(ProductIdea::SCOUTING, $idea->refresh()->status);
    }

    #[Test]
    public function rejecting_needs_a_reason_and_is_final(): void
    {
        $storeAdmin = $this->user('admin', $this->own);
        $idea = $this->idea($this->own);

        $this->move('admin', $storeAdmin, $idea, ProductIdea::REJECTED)->assertSessionHas('error');
        $this->move('admin', $storeAdmin, $idea, ProductIdea::REJECTED, ['note' => 'We sell a cheaper one'])->assertSessionHas('success');
        $this->move('admin', $storeAdmin, $idea, ProductIdea::SCOUTING, ['target_price' => 1])->assertSessionHas('error');

        $this->assertSame(ProductIdea::REJECTED, $idea->refresh()->status);
        $this->assertSame('We sell a cheaper one', $idea->events()->latest('id')->value('note'));
    }

    #[Test]
    public function procurement_may_turn_down_an_idea_being_sourced_but_not_approve_it(): void
    {
        $buyer = $this->user('procurement');
        $idea = $this->idea($this->own, ProductIdea::SOURCING, ['target_price' => 650]);

        $this->move('procurement', $buyer, $idea, ProductIdea::APPROVED)->assertSessionHas('error');
        $this->move('procurement', $buyer, $idea, ProductIdea::REJECTED, ['note' => 'No supplier sells it under 700'])->assertSessionHas('success');

        $this->assertSame(ProductIdea::REJECTED, $idea->refresh()->status);
    }

    #[Test]
    public function bought_is_never_set_by_hand(): void
    {
        $idea = $this->idea($this->own, ProductIdea::APPROVED);

        $this->move('admin', $this->user('admin'), $idea, ProductIdea::BOUGHT)->assertSessionHas('error');

        $this->assertSame(ProductIdea::APPROVED, $idea->refresh()->status);
    }

    // ---- Who may not ----

    #[Test]
    public function a_seller_cannot_move_an_idea(): void
    {
        $idea = $this->idea($this->own);

        $this->move('seller', $this->user('seller', $this->own), $idea, ProductIdea::SCOUTING, ['target_price' => 650])
            ->assertSessionHas('error');

        $this->assertSame(ProductIdea::SUGGESTED, $idea->refresh()->status);
    }

    #[Test]
    public function another_stores_admin_cannot_see_or_move_an_idea(): void
    {
        $idea = $this->idea($this->own);

        $this->move('admin', $this->user('admin', $this->other), $idea, ProductIdea::SCOUTING, ['target_price' => 650])
            ->assertNotFound();

        $this->assertSame(ProductIdea::SUGGESTED, $idea->refresh()->status);
    }

    #[Test]
    public function an_idea_for_every_store_is_moved_by_a_global_admin_only(): void
    {
        $idea = $this->idea(null);

        $this->move('admin', $this->user('admin', $this->own), $idea, ProductIdea::SCOUTING, ['target_price' => 650])
            ->assertSessionHas('error');
        $this->move('admin', $this->user('admin'), $idea, ProductIdea::SCOUTING, ['target_price' => 650, 'store_id' => $this->own->id])
            ->assertSessionHas('success');
    }

    /** One price at one of the store's shops, verified by a second person. */
    private function verifiedPrice(ProductIdea $idea): void
    {
        $check = $idea->priceChecks()->sole();
        $shop = \App\Models\Procurement\Shop::factory()->create();
        $shop->stores()->attach($check->store_id, ['mode' => \App\Models\Procurement\Shop::CHECK]);

        $check->observations()->create([
            'shop_id' => $shop->id, 'recorded_by' => $this->user('seller', $this->own)->id, 'observed_on' => now()->toDateString(),
            'pack_type' => 'piece', 'pieces_per_pack' => 1, 'min_qty' => 1, 'price' => 600, 'price_per_piece' => 600,
            'verified_by' => $this->user('store_manager', $this->own)->id, 'verified_at' => now(),
        ]);
    }

    // ---- Seeing ----

    #[Test]
    public function a_seller_sees_their_stores_ideas_and_the_ones_for_every_store(): void
    {
        $mine = $this->idea($this->own);
        $everyone = $this->idea(null);
        $this->idea($this->other);

        $this->on('seller', $this->user('seller', $this->own))->get(route('seller.ideas.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Seller/Ideas/Index')
                ->where('ideas', fn ($rows) => collect($rows)->pluck('id')->sort()->values()->all() === [$mine->id, $everyone->id])
                ->where('ideas.0.moves', [])
                ->where('stores', [])
                ->where('routePrefix', 'seller.ideas'));
    }

    #[Test]
    public function the_store_admin_sees_the_moves_they_may_make(): void
    {
        $idea = $this->idea($this->own);

        $this->on('admin', $this->user('admin', $this->own))->get(route('admin.ideas.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/Ideas/Index')
                ->where('ideas.0.id', $idea->id)
                ->where('ideas.0.moves', fn ($moves) => collect($moves)->pluck('to')->all() === [ProductIdea::SCOUTING, ProductIdea::REJECTED])
                ->where('stores', [['id' => $this->own->id, 'name' => 'Bole']]));
    }

    #[Test]
    public function procurement_sees_every_idea_and_the_tabs_filter_them(): void
    {
        $this->idea($this->own);
        $sourcing = $this->idea($this->other, ProductIdea::SOURCING);
        $this->idea(null, ProductIdea::REJECTED);
        $buyer = $this->user('procurement');

        $this->on('procurement', $buyer)->get(route('procurement.ideas.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Procurement/Ideas/Index')
                ->has('ideas', 2)
                ->where('counts', [ProductIdea::SUGGESTED => 1, ProductIdea::SOURCING => 1, ProductIdea::REJECTED => 1]));

        $this->on('procurement', $buyer)->get(route('procurement.ideas.index', ['tab' => ProductIdea::SOURCING]))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('ideas', 1)->where('ideas.0.id', $sourcing->id));
    }
}
