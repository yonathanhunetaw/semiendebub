<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\Auth\User;
use App\Services\Admin\ActiveStore;

/**
 * Who is looking at the calendar, and from which app.
 *
 *   storeIds       the stores whose module records they see; null = every store
 *                  (admin: the active store; the other apps: the user's store,
 *                  or every store for a user tied to none, as elsewhere)
 *   entryStoreIds  the stores whose shared calendar entries they see; null =
 *                  every store. Company-wide entries (no store) are seen by all.
 *   courierId      the delivery app: only the runs this driver carries
 */
final class CalendarScope
{
    public const APPS = ['admin', 'seller', 'stock_keeper', 'delivery', 'procurement'];

    /**
     * @param  array<int, int>|null  $storeIds
     * @param  array<int, int>|null  $entryStoreIds
     */
    public function __construct(
        public readonly string $app,
        public readonly User $viewer,
        public readonly ?array $storeIds,
        public readonly ?array $entryStoreIds,
        public readonly ?int $courierId = null,
    ) {
    }

    public static function for(string $app, User $viewer, ?ActiveStore $activeStore = null): self
    {
        if ($app === 'admin' && $activeStore !== null && $activeStore->isResolved()) {
            $ids = $activeStore->scopeIds();

            return new self($app, $viewer, $ids, $ids);
        }

        $own = $viewer->store_id !== null ? [(int) $viewer->store_id] : null;

        return new self(
            $app,
            $viewer,
            $own,
            $own ?? [],
            $app === 'delivery' ? (int) $viewer->id : null,
        );
    }

    /** The store a new shared entry belongs to (null: company-wide). */
    public function storeForNewEntry(?ActiveStore $activeStore = null): ?int
    {
        if ($this->app === 'admin' && $activeStore !== null && $activeStore->isResolved()) {
            return $activeStore->id();
        }

        return $this->viewer->store_id !== null ? (int) $this->viewer->store_id : null;
    }

    /** Is a record of this store inside the view? */
    public function covers(?int $storeId): bool
    {
        return $this->storeIds === null || ($storeId !== null && in_array($storeId, $this->storeIds, true));
    }
}
