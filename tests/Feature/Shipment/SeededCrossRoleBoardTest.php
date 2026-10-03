<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The four shipment boards, over the data the seeders actually produce.
 *
 * CrossRoleShipmentTest builds its world by hand, which is why it kept passing
 * while the running app was broken: it never created a user the way the seeders
 * do. A role is recorded twice — in `users.role` and as an assigned Spatie role —
 * and the writers disagreed about which to fill:
 *
 *   - the user seeder's batch loop unset `role` before insert, so
 *     admin@admin.com and stockkeeper@stockkeeper.com held a Spatie role and a
 *     NULL column. Route gates read the assignment and let them in;
 *     ShipmentWorkflowService read the column and gave them nothing. Both signed
 *     in to a completely empty shipment board with every action button missing.
 *   - Admin\UserController wrote the column and never assigned, so a delivery or
 *     stock keeper account created through the admin screens was refused by
 *     every subdomain it was entitled to.
 *
 * Two more seeding gaps hid the same flow: FacilitySeeder, which creates the
 * warehouses and stocks them, was never registered — so a standard seed had no
 * warehouse to replenish *from* — and the stock keeper board opened on
 * `outbound`, so an inbound replenishment a seller raised was one toggle away
 * with nothing to say it existed.
 *
 * So these tests run the real DatabaseSeeder and assert the handoff the business
 * actually depends on: a run raised by a seller or an admin reaches the delivery
 * board and the stock keeper board, and the three of them together can carry it
 * to received.
 */
class SeededCrossRoleBoardTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Run the real seeders once for this class.
     *
     * RefreshDatabase seeds inside the per-test transaction when told to, which
     * would re-run the whole 15-second seed for every test. Setting `$seed`
     * instead folds it into the one-time `migrate:fresh`, outside the
     * transaction, so it happens once and each test's own writes still roll back.
     */
    protected bool $seed = true;

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();

        // Whatever ran before us in the suite already marked the database
        // migrated, and it was migrated without a seed. Force the one-time block
        // to run again so this class is guaranteed the seeded world.
        RefreshDatabaseState::$migrated = false;
    }

    public static function tearDownAfterClass(): void
    {
        // Hand the next class a clean database rather than our seeded one.
        RefreshDatabaseState::$migrated = false;

        parent::tearDownAfterClass();
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function seededUser(string $email): User
    {
        $user = User::query()->where('email', $email)->first();

        $this->assertNotNull($user, "The seeders are expected to create {$email}.");

        return $user;
    }

    /** Act as a seeded user on their own subdomain. */
    private function asUser(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => $subdomain . '.' . config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }

    /**
     * The references on a role's board.
     *
     * @return array<int, string>
     */
    private function boardReferences(User $user, string $subdomain, string $routeName, array $query = []): array
    {
        $response = $this->asUser($user, $subdomain)->get(route($routeName, $query));

        $response->assertOk();

        $props = $response->viewData('page')['props'];
        $rows = $props['scheduled_transfers'] ?? $props['shipments'] ?? [];

        return array_column($rows, 'reference');
    }

    private function workflow(): ShipmentWorkflowService
    {
        return app(ShipmentWorkflowService::class);
    }

    /**
     * The seeded seller, at a retail store that receives freight.
     *
     * Shipments run from a Main Hub to a store or a Remote Hub (STOCK_PLAN.md
     * phase 4), so a seller's own shop is a legal destination and they are
     * kept there. Only the store_id is pinned, so everything they can see
     * follows from it exactly as before. The write rolls back with the test.
     */
    private function sellerAtFreightDock(string $email = 'seller@seller.com'): User
    {
        $seller = $this->seededUser($email);

        $dock = Store::query()->retail()->orderBy('id')->first();

        $this->assertNotNull($dock, 'The seeders are expected to create retail stores.');

        $seller->forceFill(['store_id' => $dock->id])->save();

        return $seller->refresh();
    }

    /** A Main Hub facility that holds enough stock to actually dispatch from. */
    private function stockedOrigin(int $notStoreId): Store
    {
        $hubIds = Store::query()->where('type', Store::TYPE_CENTRAL_WAREHOUSE)->pluck('id');

        $storeId = ItemStock::query()
            ->where('location_type', Store::class)
            ->whereIn('location_id', $hubIds)
            ->where('location_id', '!=', $notStoreId)
            ->where('quantity', '>', 50)
            ->value('location_id');

        $this->assertNotNull($storeId, 'The seeders are expected to stock at least one Main Hub.');

        return Store::findOrFail($storeId);
    }

    /* =====================================================================
     | The role each account actually has
     |====================================================================*/

    #[Test]
    public function every_seeded_account_reads_as_the_role_its_route_gate_admits(): void
    {
        $mismatched = [];

        foreach (User::query()->with('roles')->get() as $user) {
            $assigned = $user->roles->pluck('name')->first();

            if ($assigned === null) {
                // No assignment at all means no subdomain will admit them, which
                // is its own bug — every seeded account is given one.
                $mismatched[] = "{$user->email}: no assigned role";

                continue;
            }

            if ($user->roleKey() !== $assigned) {
                $mismatched[] = sprintf(
                    '%s: gate admits %s, roleKey() says %s',
                    $user->email,
                    $assigned,
                    $user->roleKey() ?: '(nothing)',
                );
            }
        }

        $this->assertSame([], $mismatched, implode(PHP_EOL, $mismatched));
    }

    #[Test]
    public function writing_the_role_column_assigns_the_matching_role(): void
    {
        // The path Admin\UserController takes: it writes the column and nothing
        // else. Without the invariant on the model, this user could not pass a
        // single route gate.
        $user = User::create([
            'first_name' => 'Fleet',
            'last_name' => 'Hire',
            'email' => 'fleet.hire@example.test',
            'phone_number' => '0900000111',
            'password' => bcrypt('password'),
            'role' => 'delivery',
        ]);

        $this->assertTrue($user->fresh()->hasRole('delivery'));
        $this->assertSame('delivery', $user->fresh()->roleKey());

        // And re-roling takes the old role away rather than stacking them.
        $user->update(['role' => 'seller']);

        $this->assertTrue($user->fresh()->hasRole('seller'));
        $this->assertFalse($user->fresh()->hasRole('delivery'));
    }

    #[Test]
    public function an_account_whose_role_column_is_empty_still_gets_its_own_board(): void
    {
        // Exactly the state eight seeded accounts were left in: a Spatie role
        // that every route gate honours, and a NULL `role` column. Fixing the
        // seeder stops new accounts landing here, but databases already carry
        // them, so the read path has to cope on its own.
        $admin = $this->seededUser('admin@admin.com');
        $keeper = $this->seededUser('stockkeeper@stockkeeper.com');

        foreach ([$admin, $keeper] as $user) {
            DB::table('users')->where('id', $user->id)->update(['role' => null]);
        }

        $admin = $admin->fresh();
        $keeper = $keeper->fresh();

        $this->assertSame('admin', $admin->roleKey(), 'The assignment must answer when the column cannot.');
        $this->assertSame('stock_keeper', $keeper->roleKey());

        $response = $this->asUser($admin, 'admin')->get(route('admin.inventory.shipments.index'));
        $response->assertOk();

        $this->assertCount(
            min(Shipment::count(), 20),
            $response->viewData('page')['props']['shipments'],
            'This board came back empty: the gate admitted an admin, the board saw nobody.'
        );

        $this->assertNotEmpty(
            $this->boardReferences($keeper, 'stock-keeper', 'stock_keeper.shipments.index'),
            'And so did the warehouse board.'
        );
    }

    #[Test]
    public function an_account_with_no_assigned_role_falls_back_to_its_role_column(): void
    {
        // The other direction, which Admin\UserController used to produce: a
        // column value and no assignment at all. The gate refuses these
        // outright, so the fallback is what makes such a row diagnosable rather
        // than silently roleless.
        $user = $this->seededUser('seller@seller.com');
        $user->roles()->detach();
        $user->unsetRelation('roles');

        $this->assertSame('seller', $user->roleKey());
    }

    /* =====================================================================
     | Every board is populated
     |====================================================================*/

    #[Test]
    public function the_seeded_admin_account_sees_every_run_with_real_actions(): void
    {
        $admin = $this->seededUser('admin@admin.com');

        $response = $this->asUser($admin, 'admin')->get(route('admin.inventory.shipments.index'));
        $response->assertOk();
        $props = $response->viewData('page')['props'];

        $this->assertGreaterThan(0, Shipment::count(), 'The seeders are expected to create shipments.');
        $this->assertCount(
            min(Shipment::count(), 20),
            $props['shipments'],
            'The admin board is unrestricted; it must show every run.'
        );

        // An empty board was only half of it: with no role resolved, every row
        // also came back with nothing the admin was allowed to do to it.
        $this->assertNotEmpty(
            array_filter(array_column($props['shipments'], 'allowed_transitions')),
            'An admin must be able to drive at least one seeded run.'
        );
    }

    #[Test]
    public function the_seeded_stock_keeper_account_sees_the_board_it_has_to_work(): void
    {
        $keeper = $this->seededUser('stockkeeper@stockkeeper.com');

        $references = $this->boardReferences($keeper, 'stock-keeper', 'stock_keeper.shipments.index');

        $this->assertNotEmpty($references, 'The warehouse board must not be empty.');

        $props = $this->asUser($keeper, 'stock-keeper')
            ->get(route('stock_keeper.shipments.index'))
            ->viewData('page')['props'];

        $this->assertNotEmpty(
            array_filter(array_column($props['scheduled_transfers'], 'actionable_parties')),
            'A keeper must be a party to at least one run on their own board.'
        );
    }

    #[Test]
    public function the_seeded_courier_sees_the_freight_board(): void
    {
        $courier = User::role('delivery')->firstOrFail();

        $references = $this->boardReferences($courier, 'delivery', 'delivery.shipments.index');

        $this->assertNotEmpty($references, 'The courier board must not be empty.');
    }

    /* =====================================================================
     | Seller and admin hand off to delivery and the stock keeper
     |====================================================================*/

    #[Test]
    public function a_run_the_seller_raises_appears_on_the_delivery_stock_keeper_and_admin_boards(): void
    {
        $seller = $this->sellerAtFreightDock();
        $origin = $this->stockedOrigin((int) $seller->store_id);

        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_store_id' => $origin->id,
                'destination_store_id' => $seller->store_id,
                'scheduled_for' => now()->addDay()->format('Y-m-d\TH:i'),
            ])
            ->assertSessionHasNoErrors();

        $raised = Shipment::query()->where('created_by', $seller->id)->latest('id')->firstOrFail();

        $this->assertContains($raised->reference, $this->boardReferences(
            User::role('delivery')->firstOrFail(), 'delivery', 'delivery.shipments.index',
        ), 'A run a seller raised must reach the courier board, or the fleet party can never agree.');

        $this->assertContains($raised->reference, $this->boardReferences(
            $this->seededUser('stockkeeper@stockkeeper.com'), 'stock-keeper', 'stock_keeper.shipments.index',
        ), 'A run a seller raised must reach the keeper who has to pick it.');

        $this->assertContains($raised->reference, $this->boardReferences(
            $this->seededUser('admin@admin.com'), 'admin', 'admin.inventory.shipments.index',
        ), 'A run a seller raised must reach the admin board.');
    }

    #[Test]
    public function a_run_the_admin_raises_appears_on_the_seller_delivery_and_stock_keeper_boards(): void
    {
        $admin = $this->seededUser('admin@admin.com');
        $seller = $this->sellerAtFreightDock();
        $origin = $this->stockedOrigin((int) $seller->store_id);

        $this->asUser($admin, 'admin')
            ->post(route('admin.inventory.shipments.store'), [
                'origin_store_id' => $origin->id,
                'destination_store_id' => $seller->store_id,
                'scheduled_for' => now()->addDay()->format('Y-m-d\TH:i'),
            ])
            ->assertSessionHasNoErrors();

        $raised = Shipment::query()->where('created_by', $admin->id)->latest('id')->firstOrFail();

        $this->assertContains($raised->reference, $this->boardReferences(
            $seller, 'seller', 'seller.shipments.index',
        ), 'The store being replenished must see the run coming.');

        $this->assertContains($raised->reference, $this->boardReferences(
            User::role('delivery')->firstOrFail(), 'delivery', 'delivery.shipments.index',
        ));

        $this->assertContains($raised->reference, $this->boardReferences(
            $this->seededUser('stockkeeper@stockkeeper.com'), 'stock-keeper', 'stock_keeper.shipments.index',
        ));
    }

    #[Test]
    public function the_stock_keeper_board_shows_inbound_runs_without_switching_direction(): void
    {
        $seller = $this->sellerAtFreightDock();
        $origin = $this->stockedOrigin((int) $seller->store_id);

        // A keeper posted to the store being replenished. The seeded keepers
        // cover every dock, which masked this entirely.
        $keeper = $this->seededUser('stockkeeper@stockkeeper.com');
        $keeper->update(['store_id' => $seller->store_id]);

        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_store_id' => $origin->id,
                'destination_store_id' => $seller->store_id,
                'scheduled_for' => now()->addDay()->format('Y-m-d\TH:i'),
            ])
            ->assertSessionHasNoErrors();

        $raised = Shipment::query()->where('created_by', $seller->id)->latest('id')->firstOrFail();

        $this->assertContains(
            $raised->reference,
            $this->boardReferences($keeper->fresh(), 'stock-keeper', 'stock_keeper.shipments.index'),
            'The board opened on outbound only, so a replenishment into this very store was invisible.'
        );

        // The filter still works when asked for explicitly.
        $this->assertNotContains(
            $raised->reference,
            $this->boardReferences($keeper->fresh(), 'stock-keeper', 'stock_keeper.shipments.index', ['direction' => 'outbound']),
        );
        $this->assertContains(
            $raised->reference,
            $this->boardReferences($keeper->fresh(), 'stock-keeper', 'stock_keeper.shipments.index', ['direction' => 'inbound']),
        );
    }

    #[Test]
    public function the_admin_board_can_single_out_runs_awaiting_agreement(): void
    {
        $admin = $this->seededUser('admin@admin.com');

        $response = $this->asUser($admin, 'admin')->get(route('admin.inventory.shipments.index'));
        $counts = $response->viewData('page')['props']['counts'];

        $this->assertArrayHasKey(
            'pending_agreement',
            $counts,
            'The one status a freshly raised run sits in had no count on the admin board.'
        );
        $this->assertSame(
            Shipment::query()->where('status', ShipmentWorkflowService::PENDING_AGREEMENT)->count(),
            $counts['pending_agreement'],
        );

        $filtered = $this->asUser($admin, 'admin')
            ->get(route('admin.inventory.shipments.index', ['status' => ShipmentWorkflowService::PENDING_AGREEMENT]))
            ->viewData('page')['props']['shipments'];

        $this->assertNotEmpty($filtered);
        foreach ($filtered as $row) {
            $this->assertSame(ShipmentWorkflowService::PENDING_AGREEMENT, $row['status']);
        }
    }

    /* =====================================================================
     | The delivery window the four parties agree on
     |====================================================================*/

    #[Test]
    public function the_alternate_windows_a_seller_proposes_reach_the_record(): void
    {
        $seller = $this->sellerAtFreightDock();
        $origin = $this->stockedOrigin((int) $seller->store_id);

        $primary = now()->addDay()->setTime(8, 30)->format('Y-m-d\TH:i');
        $second = now()->addDay()->setTime(17, 0)->format('Y-m-d\TH:i');
        $third = now()->addDays(2)->setTime(8, 30)->format('Y-m-d\TH:i');

        // The "New Shipment" sheet has always collected these under "Alternate
        // Time Windows". They were dropped by the page, then by the validator,
        // then by the controller.
        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_store_id' => $origin->id,
                'destination_store_id' => $seller->store_id,
                'scheduled_for' => $primary,
                'schedule_options' => [$primary, $second, $third],
            ])
            ->assertSessionHasNoErrors();

        $shipment = Shipment::query()->where('created_by', $seller->id)->latest('id')->firstOrFail();

        $this->assertSame(
            [$primary, $second, $third],
            $this->workflow()->scheduleOptions($shipment),
            'A run offering one window is not something the other parties can agree about.'
        );
    }

    #[Test]
    public function the_courier_detail_page_carries_the_windows_and_their_own_seat(): void
    {
        $courier = User::role('delivery')->firstOrFail();
        $shipment = Shipment::query()
            ->where('status', ShipmentWorkflowService::PENDING_AGREEMENT)
            ->firstOrFail();

        $props = $this->asUser($courier, 'delivery')
            ->get(route('delivery.shipments.show', $shipment))
            ->assertOk()
            ->viewData('page')['props'];

        // present() sent these all along; the page rendered none of them, so a
        // driver had nowhere to accept a window.
        $this->assertNotEmpty($props['shipment']['schedule_options']);
        $this->assertArrayHasKey('fleet', $props['shipment']['agreements']);
        $this->assertContains(
            'fleet',
            $props['shipment']['actionable_parties'],
            'The courier must be told they hold the fleet seat, or the page cannot offer the action.'
        );
    }

    #[Test]
    public function the_keeper_and_admin_detail_pages_carry_their_seats_too(): void
    {
        $shipment = Shipment::query()
            ->where('status', ShipmentWorkflowService::PENDING_AGREEMENT)
            ->firstOrFail();

        $keeperProps = $this->asUser($this->seededUser('stockkeeper@stockkeeper.com'), 'stock-keeper')
            ->get(route('stock_keeper.shipments.show', $shipment))
            ->assertOk()
            ->viewData('page')['props'];

        $this->assertNotEmpty(array_intersect(
            ['origin', 'destination'],
            $keeperProps['shipment']['actionable_parties'],
        ));

        $adminProps = $this->asUser($this->seededUser('admin@admin.com'), 'admin')
            ->get(route('admin.inventory.shipments.show', $shipment))
            ->assertOk()
            ->viewData('page')['props'];

        // Admin stands in for every party.
        $this->assertSame(
            ['creator', 'fleet', 'origin', 'destination'],
            $adminProps['shipment']['actionable_parties'],
        );
    }

    #[Test]
    public function the_parties_can_settle_on_an_alternate_window_rather_than_the_first(): void
    {
        $seller = $this->sellerAtFreightDock();
        $courier = User::role('delivery')->firstOrFail();
        $keeper = $this->seededUser('stockkeeper@stockkeeper.com');
        $origin = $this->stockedOrigin((int) $seller->store_id);

        $primary = now()->addDay()->setTime(8, 30)->format('Y-m-d\TH:i');
        $alternate = now()->addDays(2)->setTime(17, 0)->format('Y-m-d\TH:i');

        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_store_id' => $origin->id,
                'destination_store_id' => $seller->store_id,
                'scheduled_for' => $primary,
                'schedule_options' => [$primary, $alternate],
            ])
            ->assertSessionHasNoErrors();

        $shipment = Shipment::query()->where('created_by', $seller->id)->latest('id')->firstOrFail();

        // The driver cannot make the first window and says so.
        $this->asUser($courier, 'delivery')
            ->post(route('delivery.shipments.agree', $shipment), [
                'slot' => $primary,
                'stance' => ShipmentWorkflowService::AGREEMENT_RESCHEDULED,
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(
            ShipmentWorkflowService::PENDING_AGREEMENT,
            $shipment->fresh()->status,
            'A party who cannot make the window must not let the run through the gate.'
        );

        // Everyone then converges on the alternate.
        foreach ([
            [$seller, 'seller', 'seller.shipments.agree', 'creator'],
            [$courier, 'delivery', 'delivery.shipments.agree', 'fleet'],
            [$keeper, 'stock-keeper', 'stock_keeper.shipments.agree', 'origin'],
            [$seller, 'seller', 'seller.shipments.agree', 'destination'],
        ] as [$actor, $subdomain, $routeName, $party]) {
            $this->asUser($actor, $subdomain)
                ->post(route($routeName, $shipment), [
                    'party' => $party,
                    'slot' => $alternate,
                    'stance' => ShipmentWorkflowService::AGREEMENT_ACCEPTED,
                ])
                ->assertSessionHasNoErrors();
        }

        $shipment = $shipment->fresh();

        $this->assertSame(ShipmentWorkflowService::SCHEDULED, $shipment->status);
        $this->assertSame(
            $alternate,
            $shipment->agreed_scheduled_for?->format('Y-m-d\TH:i'),
            'The run must be scheduled for the window they actually agreed on.'
        );
        $this->assertSame($alternate, $shipment->scheduled_for?->format('Y-m-d\TH:i'));
    }

    #[Test]
    public function a_window_nobody_proposed_cannot_be_agreed_to(): void
    {
        $courier = User::role('delivery')->firstOrFail();
        $shipment = Shipment::query()
            ->where('status', ShipmentWorkflowService::PENDING_AGREEMENT)
            ->firstOrFail();

        $this->asUser($courier, 'delivery')
            ->post(route('delivery.shipments.agree', $shipment), [
                'slot' => now()->addYear()->format('Y-m-d\TH:i'),
            ])
            ->assertSessionHasErrors('slot');
    }

    /* =====================================================================
     | The whole handoff, on seeded data
     |====================================================================*/

    #[Test]
    public function seller_admin_delivery_and_the_stock_keeper_carry_one_run_to_received(): void
    {
        $seller = $this->sellerAtFreightDock();
        $courier = User::role('delivery')->firstOrFail();
        $keeper = $this->seededUser('stockkeeper@stockkeeper.com');
        $destination = Store::findOrFail((int) $seller->store_id);
        $origin = $this->stockedOrigin($destination->id);

        // A SKU the origin genuinely holds, so the dispatch has units to move.
        $stock = ItemStock::query()
            ->where('location_type', Store::class)
            ->where('location_id', $origin->id)
            ->where('quantity', '>', 50)
            ->firstOrFail();

        $slot = now()->addDay()->format('Y-m-d\TH:i');
        $before = $this->stockAt($origin->id, (int) $stock->item_variant_id);
        $landedBefore = $this->stockAt($destination->id, (int) $stock->item_variant_id);

        // ── Seller raises it and builds the manifest ──
        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.store'), [
                'origin_store_id' => $origin->id,
                'destination_store_id' => $destination->id,
                'scheduled_for' => $slot,
            ])
            ->assertSessionHasNoErrors();

        $shipment = Shipment::query()->where('created_by', $seller->id)->latest('id')->firstOrFail();

        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.items.bulk', $shipment), [
                'lines' => [['item_variant_id' => $stock->item_variant_id, 'quantity' => 10, 'unit' => 'Ctn']],
            ])
            ->assertSessionHasNoErrors();

        // ── The gate: the courier and the two docks have to agree ──
        $this->asUser($courier, 'delivery')
            ->post(route('delivery.shipments.agree', $shipment), ['slot' => $slot])
            ->assertSessionHasNoErrors();

        $this->asUser($keeper, 'stock-keeper')
            ->post(route('stock_keeper.shipments.agree', $shipment), ['party' => 'origin', 'slot' => $slot])
            ->assertSessionHasNoErrors();

        $this->asUser($seller, 'seller')
            ->post(route('seller.shipments.agree', $shipment), ['party' => 'destination', 'slot' => $slot])
            ->assertSessionHasNoErrors();

        $this->assertSame(
            ShipmentWorkflowService::SCHEDULED,
            $shipment->fresh()->status,
            'Four aligned ticks must schedule the run.'
        );

        // ── The floor picks and hands over ──
        foreach ([ShipmentWorkflowService::PICKING, ShipmentWorkflowService::READY, ShipmentWorkflowService::DISPATCHED] as $stage) {
            $this->asUser($keeper, 'stock-keeper')
                ->patch(route('stock_keeper.shipments.transition', $shipment), ['status' => $stage])
                ->assertSessionHasNoErrors();

            $this->assertSame($stage, $shipment->fresh()->status);
        }

        $this->assertSame(
            $before - 10,
            $this->stockAt($origin->id, (int) $stock->item_variant_id),
            'Dispatch is the moment the units leave the origin ledger.'
        );

        // ── The courier drives it ──
        foreach ([ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED] as $stage) {
            $this->asUser($courier, 'delivery')
                ->patch(route('delivery.shipments.transition', $shipment), ['status' => $stage])
                ->assertSessionHasNoErrors();

            $this->assertSame($stage, $shipment->fresh()->status);
        }

        // ── The seller confirms receipt ──
        $this->asUser($seller, 'seller')
            ->patch(route('seller.shipments.transition', $shipment), ['status' => ShipmentWorkflowService::RECEIVED])
            ->assertSessionHasNoErrors();

        $this->assertSame(ShipmentWorkflowService::RECEIVED, $shipment->fresh()->status);
        $this->assertSame(
            $landedBefore + 10,
            $this->stockAt($destination->id, (int) $stock->item_variant_id),
            'Receipt is the moment the units land on the destination ledger.'
        );
    }

    private function stockAt(int $storeId, int $variantId): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $variantId)
            ->where('location_type', Store::class)
            ->where('location_id', $storeId)
            ->sum('quantity');
    }
}
