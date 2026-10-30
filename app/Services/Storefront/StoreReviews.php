<?php

declare(strict_types=1);

namespace App\Services\Storefront;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Store\Store;
use App\Models\Store\StoreReview;
use App\Services\Inventory\StockPermissions;
use Illuminate\Validation\ValidationException;

/**
 * Store reviews: only someone who received an order from the store reviews it,
 * once per store (a second one replaces the first). A global admin hides an
 * abusive review; a hidden one leaves the average too.
 */
class StoreReviews
{
    public const SHOWN = 10;

    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    /**
     * The delivered order that lets this person review the store, if any: they are a
     * shopper (never staff, who would rate their own store), and the order's customer
     * carries their email. A sale's user_id is whoever rang it up, not the buyer.
     */
    public function qualifyingSale(?User $user, Store $store): ?Sale
    {
        if ($user === null || ! in_array($user->roleKey(), ['user', 'customer', ''], true) || blank($user->email)) {
            return null;
        }

        return Sale::query()
            ->where('store_id', $store->id)
            ->where('fulfillment_stage', Sale::STAGE_DELIVERED)
            ->whereHas('customer', fn ($q) => $q->where('email', $user->email))
            ->latest('id')
            ->first();
    }

    public function save(User $user, Store $store, int $rating, ?string $comment): StoreReview
    {
        $sale = $this->qualifyingSale($user, $store);

        if ($sale === null) {
            throw ValidationException::withMessages(['rating' => 'You can review a store once an order from it has reached you.']);
        }

        return StoreReview::query()->updateOrCreate(
            ['store_id' => $store->id, 'user_id' => $user->id],
            ['sale_id' => $sale->id, 'rating' => max(1, min(5, $rating)), 'comment' => $comment !== null && trim($comment) !== '' ? trim($comment) : null],
        );
    }

    public function hide(StoreReview $review, User $by): void
    {
        abort_unless($this->permissions->isGlobalAdmin($by), 403);

        $review->update(['hidden_at' => now(), 'hidden_by' => $by->id]);
    }

    /**
     * What a store page shows: the average, how many, the latest ones, and what
     * this viewer may do.
     *
     * @return array<string, mixed>
     */
    public function forStorePage(Store $store, ?User $viewer): array
    {
        $shown = StoreReview::query()->shown()->where('store_id', $store->id);
        $mine = $viewer ? StoreReview::query()->where('store_id', $store->id)->where('user_id', $viewer->id)->first() : null;

        return [
            'average' => ($avg = (clone $shown)->avg('rating')) !== null ? round((float) $avg, 1) : null,
            'count' => (clone $shown)->count(),
            'latest' => (clone $shown)->with('user:id,first_name,last_name')->latest('updated_at')->limit(self::SHOWN)->get()
                ->map(fn (StoreReview $r): array => [
                    'id' => (int) $r->id,
                    'rating' => $r->rating,
                    'comment' => $r->comment,
                    // First name and an initial: enough to be a person, not enough to find them.
                    'by' => trim(($r->user?->first_name ?? 'A shopper').' '.mb_substr((string) ($r->user?->last_name ?? ''), 0, 1)),
                    'at' => $r->updated_at?->toIso8601String(),
                ])->values()->all(),
            'can_review' => $this->qualifyingSale($viewer, $store) !== null,
            'mine' => $mine ? ['rating' => $mine->rating, 'comment' => $mine->comment] : null,
        ];
    }
}
