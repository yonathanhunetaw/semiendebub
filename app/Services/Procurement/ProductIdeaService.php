<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\ProductIdeaException;
use App\Models\Auth\User;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\PriceObservation;
use App\Models\Procurement\ProductIdea;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPermissions;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Product ideas (docs/plans/procurement-pipeline.md, PP1).
 *
 * Who suggests: a seller or store manager (for their own store), a store
 * admin (for a store they run), a global admin (any store, or every store),
 * and procurement ("have you considered this?", source = procurement).
 *
 * Who moves it:
 *   suggested → scouting      the idea's store admin, or a global admin; needs a target price; opens a price check
 *                             (PriceCheckService); "prices in" needs a verified price
 *   scouting  → scouted       the same
 *   scouted   → scouting      the same (more prices wanted)
 *   scouted   → sourcing      a global admin (it goes to procurement)
 *   sourcing  → approved      a global admin
 *   any open step → rejected  whoever may move it on, plus procurement while sourcing; needs a reason
 *
 * An idea for every store (store_id null) is moved by a global admin only.
 * `bought` is set when a purchase order line buys it (PP5), never by hand.
 */
class ProductIdeaService
{
    /** @var array<string, array<int, string>> */
    private const MOVES = [
        ProductIdea::SUGGESTED => [ProductIdea::SCOUTING, ProductIdea::REJECTED],
        ProductIdea::SCOUTING => [ProductIdea::SCOUTED, ProductIdea::REJECTED],
        ProductIdea::SCOUTED => [ProductIdea::SOURCING, ProductIdea::SCOUTING, ProductIdea::REJECTED],
        ProductIdea::SOURCING => [ProductIdea::APPROVED, ProductIdea::REJECTED],
    ];

    public function __construct(
        private readonly StockPermissions $permissions,
        private readonly PriceCheckService $checks,
    ) {
    }

    /*
    |--------------------------------------------------------------------------
    | Suggesting
    |--------------------------------------------------------------------------
    */

    public function canSuggest(?User $user): bool
    {
        return $user !== null && in_array($user->roleKey(), ['seller', 'store_manager', 'admin', 'dev', 'procurement'], true);
    }

    /**
     * @param  array{name: string, spec?: ?string, reason?: ?string, target_price?: float|int|string|null, store_id?: int|string|null}  $data
     *
     * @throws ProductIdeaException
     */
    public function suggest(User $by, array $data): ProductIdea
    {
        if (! $this->canSuggest($by)) {
            throw new ProductIdeaException('You cannot suggest products.', 403);
        }

        $storeId = $this->storeFor($by, isset($data['store_id']) && $data['store_id'] !== '' ? (int) $data['store_id'] : null);

        return DB::transaction(function () use ($by, $data, $storeId): ProductIdea {
            $idea = ProductIdea::query()->create([
                'store_id' => $storeId,
                'suggested_by' => $by->id,
                'source' => $by->roleKey() === 'procurement' ? ProductIdea::SOURCE_PROCUREMENT : ProductIdea::SOURCE_STORE,
                'name' => trim($data['name']),
                'spec' => $this->text($data['spec'] ?? null),
                'reason' => $this->text($data['reason'] ?? null),
                'target_price' => $this->price($data['target_price'] ?? null),
                'status' => ProductIdea::SUGGESTED,
                'status_changed_by' => $by->id,
                'status_changed_at' => now(),
            ]);

            $idea->events()->create(['user_id' => $by->id, 'from_status' => null, 'to_status' => ProductIdea::SUGGESTED]);

            return $idea;
        });
    }

    /**
     * The store an idea from this person is for. Sellers and store managers
     * suggest for their own store; a store admin for one they run; a global
     * admin, dev or procurement for any store, or for every store (null).
     *
     * @throws ProductIdeaException
     */
    private function storeFor(User $by, ?int $requested): ?int
    {
        $role = $by->roleKey();

        if (in_array($role, ['seller', 'store_manager'], true)) {
            if ($by->store_id === null) {
                throw new ProductIdeaException('You are not assigned to a store, so there is no store to suggest for.');
            }

            return (int) $by->store_id;
        }

        if ($role === 'admin' && ! $this->permissions->isGlobalAdmin($by)) {
            $storeId = $requested ?? (int) $by->store_id;

            if (! $this->permissions->isAdminOf($by, $storeId)) {
                throw new ProductIdeaException('You can only suggest for a store you run.', 403);
            }

            return $storeId;
        }

        return $requested;
    }

    /*
    |--------------------------------------------------------------------------
    | Seeing
    |--------------------------------------------------------------------------
    */

    /**
     * The ideas this person may see. Procurement, global admins and dev see
     * all; store admins, sellers and store managers their store's ideas and
     * the ones for every store.
     *
     * @param  Builder<ProductIdea>  $query
     * @return Builder<ProductIdea>
     */
    public function visibleTo(Builder $query, ?User $user): Builder
    {
        if ($user === null) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->roleKey() === 'procurement' || $this->permissions->isGlobalAdmin($user)) {
            return $query;
        }

        $storeIds = $user->roleKey() === 'admin'
            ? (ActiveStore::accessibleIdsFor($user) ?? [])
            : array_filter([$user->store_id !== null ? (int) $user->store_id : null]);

        return $query->where(fn (Builder $q) => $q->whereNull('store_id')->orWhereIn('store_id', $storeIds));
    }

    public function canSee(?User $user, ProductIdea $idea): bool
    {
        return $this->visibleTo(ProductIdea::query()->whereKey($idea->id), $user)->exists();
    }

    /*
    |--------------------------------------------------------------------------
    | Moving
    |--------------------------------------------------------------------------
    */

    /**
     * The moves this person may make on this idea now.
     *
     * @return array<int, string>
     */
    public function movesFor(?User $user, ProductIdea $idea): array
    {
        return array_values(array_filter(
            self::MOVES[$idea->status] ?? [],
            fn (string $to): bool => $this->mayMove($user, $idea, $to),
        ));
    }

    public function mayMove(?User $user, ProductIdea $idea, string $to): bool
    {
        if ($user === null || ! in_array($to, self::MOVES[$idea->status] ?? [], true)) {
            return false;
        }

        $global = $this->permissions->isGlobalAdmin($user);
        $storeAdmin = $this->permissions->isAdminOf($user, $idea->store_id !== null ? (int) $idea->store_id : null);

        return match (true) {
            $idea->status === ProductIdea::SOURCING && $to === ProductIdea::REJECTED => $global || $user->roleKey() === 'procurement',
            $idea->status === ProductIdea::SOURCING, $to === ProductIdea::SOURCING => $global,
            default => $storeAdmin,
        };
    }

    /**
     * Sending an idea to price check opens a price check for its store (a
     * global idea names the store whose sellers check), or reopens the one it
     * had. "Prices in" needs at least one verified price, and closes the
     * checks; so do sending it to procurement and rejecting it.
     *
     * @param  array{store_id?: int|string|null, shops_wanted?: int|string|null, due_on?: ?string, assignee_ids?: array<int, int|string>, check_note?: ?string}  $check
     *
     * @throws ProductIdeaException
     */
    public function move(ProductIdea $idea, string $to, User $by, ?string $note = null, float|int|string|null $targetPrice = null, array $check = []): ProductIdea
    {
        return DB::transaction(function () use ($idea, $to, $by, $note, $targetPrice, $check): ProductIdea {
            /** @var ProductIdea $idea */
            $idea = ProductIdea::query()->lockForUpdate()->findOrFail($idea->id);
            $from = $idea->status;

            if (! in_array($to, self::MOVES[$from] ?? [], true)) {
                throw new ProductIdeaException("This idea is {$from}: it cannot go to {$to} from here.");
            }

            if (! $this->mayMove($by, $idea, $to)) {
                throw new ProductIdeaException($this->refusal($idea, $to), 403);
            }

            $note = $this->text($note);
            $price = $this->price($targetPrice);

            if ($to === ProductIdea::REJECTED && $note === null) {
                throw new ProductIdeaException('Say why it is rejected.');
            }

            if ($to === ProductIdea::SCOUTING && $price === null && $idea->target_price === null) {
                throw new ProductIdeaException('Set the price the store would sell it for before sending it to price check.');
            }

            if ($to === ProductIdea::SCOUTING) {
                $this->openChecks($idea, $by, $check);
            }

            if ($to === ProductIdea::SCOUTED) {
                $verified = PriceObservation::query()->verified()
                    ->whereHas('check', fn (Builder $q) => $q->where('product_idea_id', $idea->id))
                    ->exists();

                if (! $verified) {
                    throw new ProductIdeaException('No price is verified yet: a price someone else has checked is needed first.');
                }
            }

            if (in_array($to, [ProductIdea::SCOUTED, ProductIdea::SOURCING, ProductIdea::REJECTED], true)) {
                $idea->priceChecks()->where('status', PriceCheck::OPEN)
                    ->update(['status' => PriceCheck::CLOSED, 'closed_by' => $by->id, 'closed_at' => now()]);
            }

            $idea->update(array_filter([
                'status' => $to,
                'status_changed_by' => $by->id,
                'status_changed_at' => now(),
                'target_price' => $price,
            ], fn ($value): bool => $value !== null));

            $idea->events()->create(['user_id' => $by->id, 'from_status' => $from, 'to_status' => $to, 'note' => $note]);

            return $idea->refresh();
        });
    }

    /** Procurement or a global admin marks an approved idea bought, on the order line that buys it. */
    public function mayMarkBought(?User $user, ProductIdea $idea): bool
    {
        return $idea->status === ProductIdea::APPROVED
            && ($user?->roleKey() === 'procurement' || $this->permissions->isGlobalAdmin($user));
    }

    /**
     * The idea is bought: it takes the item of the order line that buys it
     * (procurement pipeline PP5). The only way an idea reaches `bought`.
     *
     * @throws ProductIdeaException
     */
    public function markBought(ProductIdea $idea, User $by, int $purchaseLineId): ProductIdea
    {
        return DB::transaction(function () use ($idea, $by, $purchaseLineId): ProductIdea {
            /** @var ProductIdea $idea */
            $idea = ProductIdea::query()->lockForUpdate()->findOrFail($idea->id);

            if (! $this->mayMarkBought($by, $idea)) {
                throw new ProductIdeaException($idea->status === ProductIdea::APPROVED
                    ? 'Only procurement or a global admin marks an idea bought.'
                    : 'Only an approved idea can be bought.', 403);
            }

            /** @var \App\Models\Procurement\PurchaseLine $line */
            $line = \App\Models\Procurement\PurchaseLine::query()->with(['purchase', 'variant'])->findOrFail($purchaseLineId);

            if (in_array($line->purchase?->status, [\App\Models\Procurement\Purchase::STATUS_DRAFT, \App\Models\Procurement\Purchase::STATUS_CANCELLED], true)) {
                throw new ProductIdeaException('Pick a line of an order that is going ahead (not a draft, not cancelled).');
            }

            $idea->update([
                'status' => ProductIdea::BOUGHT,
                'status_changed_by' => $by->id,
                'status_changed_at' => now(),
                'item_id' => $line->variant?->item_id,
                'purchase_line_id' => $line->id,
            ]);

            $idea->events()->create([
                'user_id' => $by->id,
                'from_status' => ProductIdea::APPROVED,
                'to_status' => ProductIdea::BOUGHT,
                'note' => "On order {$line->purchase?->reference_number}",
            ]);

            return $idea->refresh();
        });
    }

    /**
     * Back to price check reopens the checks it had; the first time opens one.
     *
     * @param  array{store_id?: int|string|null, shops_wanted?: int|string|null, due_on?: ?string, assignee_ids?: array<int, int|string>, check_note?: ?string}  $check
     *
     * @throws ProductIdeaException
     */
    private function openChecks(ProductIdea $idea, User $by, array $check): void
    {
        $closed = $idea->priceChecks()->where('status', PriceCheck::CLOSED)->get();

        if ($closed->isNotEmpty() && empty($check['store_id']) && ! isset($check['shops_wanted'])) {
            $closed->each(fn (PriceCheck $c) => $this->checks->reopen($c));

            return;
        }

        $storeId = $idea->store_id !== null ? (int) $idea->store_id : (! empty($check['store_id']) ? (int) $check['store_id'] : null);

        if ($storeId === null) {
            throw new ProductIdeaException('Pick the store whose sellers check the prices.');
        }

        $this->checks->open(
            by: $by,
            storeId: $storeId,
            idea: $idea,
            shopsWanted: isset($check['shops_wanted']) && $check['shops_wanted'] !== '' ? (int) $check['shops_wanted'] : 3,
            dueOn: ! empty($check['due_on']) ? (string) $check['due_on'] : null,
            assigneeIds: array_map('intval', $check['assignee_ids'] ?? []),
            note: $check['check_note'] ?? null,
        );
    }

    private function refusal(ProductIdea $idea, string $to): string
    {
        return match (true) {
            $idea->status === ProductIdea::SOURCING && $to === ProductIdea::REJECTED => 'Only procurement or a global admin can turn down an idea being sourced.',
            $idea->status === ProductIdea::SOURCING, $to === ProductIdea::SOURCING => 'Only a global admin can send an idea to procurement or approve it.',
            $idea->store_id === null => 'An idea for every store is moved by a global admin.',
            default => "Only this store's admin or a global admin can move this idea.",
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Presenting
    |--------------------------------------------------------------------------
    */

    /**
     * @return array<string, mixed>
     */
    public function present(ProductIdea $idea, ?User $viewer): array
    {
        $idea->loadMissing(['store', 'suggester', 'events.user', 'priceChecks.store', 'priceChecks.observations', 'priceChecks.assignees', 'quotes']);
        $observations = $idea->priceChecks->flatMap(fn (PriceCheck $c) => $c->observations);

        return [
            'id' => (int) $idea->id,
            'name' => (string) $idea->name,
            'spec' => $idea->spec,
            'reason' => $idea->reason,
            'target_price' => $idea->target_price !== null ? (float) $idea->target_price : null,
            'status' => (string) $idea->status,
            'source' => (string) $idea->source,
            'store' => $idea->store ? ['id' => (int) $idea->store->id, 'name' => (string) $idea->store->name] : null,
            'suggested_by' => self::name($idea->suggester),
            'created_at' => $idea->created_at?->toIso8601String(),
            'status_changed_at' => $idea->status_changed_at?->toIso8601String(),
            'can_mark_bought' => $this->mayMarkBought($viewer, $idea),
            'moves' => array_map(fn (string $to): array => [
                'to' => $to,
                'label' => self::moveLabel($idea->status, $to),
                'needs_note' => $to === ProductIdea::REJECTED,
                'asks_target_price' => $to === ProductIdea::SCOUTING,
                // The first trip to price check opens a check: how many shops, by when, who.
                'opens_check' => $to === ProductIdea::SCOUTING && $idea->priceChecks->isEmpty(),
                'needs_store' => $to === ProductIdea::SCOUTING && $idea->priceChecks->isEmpty() && $idea->store_id === null,
            ], $this->movesFor($viewer, $idea)),
            // A seller is not shown the checks that name other sellers.
            'checks' => $idea->priceChecks
                ->filter(fn (PriceCheck $c): bool => $viewer?->roleKey() !== 'seller' || $c->assignees->isEmpty() || $c->assignees->contains('id', $viewer->id))
                ->map(fn (PriceCheck $c): array => [
                    'id' => (int) $c->id,
                    'store' => (string) ($c->store?->name ?? ''),
                    'status' => (string) $c->status,
                    'shops_wanted' => (int) $c->shops_wanted,
                    'shops_done' => $c->observations->whereNull('rejected_at')->pluck('shop_id')->unique()->count(),
                ])->values()->all(),
            // Quotes and what the cheapest complete one costs on the shelf: procurement and admins only.
            'costs' => app(SupplierQuoteService::class)->maySeeCosts($viewer, $idea) ? [
                'quotes' => $idea->quotes->count(),
                'best_cost_per_piece' => $idea->quotes
                    ->filter(fn ($q): bool => ($q->estimate['complete'] ?? false) && ($q->estimate['cost_per_piece'] ?? null) !== null)
                    ->min(fn ($q): float => (float) $q->estimate['cost_per_piece']),
            ] : null,
            // Sellers see the idea's status, not what other shops charge.
            'prices' => $this->checks->seesAllPrices($viewer) ? PriceCheckService::summary($observations) : null,
            'events' => $idea->events->map(fn ($event): array => [
                'from' => $event->from_status,
                'to' => (string) $event->to_status,
                'by' => self::name($event->user),
                'note' => $event->note,
                'at' => $event->created_at?->toIso8601String(),
            ])->values()->all(),
        ];
    }

    public static function moveLabel(string $from, string $to): string
    {
        return match ($to) {
            ProductIdea::SCOUTING => $from === ProductIdea::SCOUTED ? 'Back to price check' : 'Send to price check',
            ProductIdea::SCOUTED => 'Prices are in',
            ProductIdea::SOURCING => 'Send to procurement',
            ProductIdea::APPROVED => 'Approve to buy',
            ProductIdea::REJECTED => 'Reject',
            default => ucfirst($to),
        };
    }

    private static function name(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        return trim($user->first_name.' '.$user->last_name) ?: (string) $user->email;
    }

    private function text(?string $value): ?string
    {
        $value = $value !== null ? trim($value) : null;

        return $value === '' ? null : $value;
    }

    private function price(float|int|string|null $value): ?float
    {
        return $value === null || $value === '' ? null : round((float) $value, 2);
    }
}
