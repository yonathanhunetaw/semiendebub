<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Store\Store;
use Illuminate\Contracts\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

/**
 * The store the admin app is looking at, and the stores the user may look at.
 *
 * There is one `admin` role. `users.store_id IS NULL` makes a **global admin**,
 * who may pick "All stores" or any one store. A set `store_id` makes a **store
 * admin**, locked to that store plus any store they manage in
 * facility_managers. Anyone else let into the admin app (a store manager on
 * the approvals screen) is locked the same way.
 *
 * Resolution: `?store=` -> session -> default (store admin: their own store;
 * global admin: all). An id the user may not reach, or one that no longer
 * exists, falls back rather than 404ing: the choice is a view preference, and
 * a store admin can never widen it, whatever the query string says.
 *
 * Every store-scoped admin screen filters through apply()/applyThrough(), so
 * the rule lives here and nowhere else.
 */
final class ActiveStore
{
    public const ALL = 'all';

    private const SESSION_KEY = 'admin.active_store';

    private bool $resolved = false;

    private ?int $activeId = null;

    /** @var Collection<int, Store>|null */
    private ?Collection $accessible = null;

    public function user(): ?User
    {
        $user = Auth::user();

        return $user instanceof User ? $user : null;
    }

    /** An admin with no store: sees every store and the global zone. */
    public function isGlobal(): bool
    {
        $user = $this->user();

        return $user !== null && $user->store_id === null && $user->isRole('admin');
    }

    /**
     * Pick the active store for this request and remember it in the session.
     *
     * Called by the ResolveActiveStore middleware; anything that reads the
     * active store before then resolves it lazily from the session alone.
     */
    public function resolve(Request $request): void
    {
        $this->resolved = true;
        $this->accessible = null;

        $requested = $request->query('store');
        $session = $request->hasSession() ? $request->session() : null;

        if (is_string($requested) && $requested !== '') {
            $choice = $this->validChoice($requested);

            if ($choice !== false) {
                $this->activeId = $choice;
                $session?->put(self::SESSION_KEY, $choice ?? self::ALL);

                return;
            }
        }

        $remembered = $session?->get(self::SESSION_KEY);
        $choice = $remembered === null ? false : $this->validChoice((string) $remembered);

        $this->activeId = $choice !== false ? $choice : $this->defaultId();
    }

    /**
     * Make a store the active one (opening a store's own page does this), so
     * the sidebar, tabs and every scoped screen follow the store being viewed.
     * Ignored for a store the user may not reach.
     */
    public function select(int $storeId, Request $request): void
    {
        if (! $this->accessibleStores()->contains('id', $storeId)) {
            return;
        }

        $this->resolved = true;
        $this->activeId = $storeId;

        if ($request->hasSession()) {
            $request->session()->put(self::SESSION_KEY, $storeId);
        }
    }

    /** Was this request routed through the admin store mechanism? */
    public function isResolved(): bool
    {
        return $this->resolved;
    }

    /** The active store's id, or null for "All stores". */
    public function id(): ?int
    {
        if (! $this->resolved) {
            $request = app(Request::class);
            $this->resolve($request);
        }

        return $this->activeId;
    }

    public function isAll(): bool
    {
        return $this->id() === null;
    }

    public function store(): ?Store
    {
        $id = $this->id();

        return $id === null ? null : $this->accessibleStores()->firstWhere('id', $id);
    }

    /**
     * The stores this user may select, retail first.
     *
     * @return Collection<int, Store>
     */
    public function accessibleStores(): Collection
    {
        if ($this->accessible !== null) {
            return $this->accessible;
        }

        $ids = $this->accessibleIds();

        return $this->accessible = Store::query()
            ->when($ids !== null, fn ($q) => $q->whereKey($ids))
            ->orderByRaw('CASE WHEN type = ? THEN 0 ELSE 1 END', [Store::TYPE_RETAIL])
            ->orderBy('name')
            ->get(['id', 'name', 'type']);
    }

    /**
     * Store ids the user may reach, or null for every store (global admin).
     *
     * @return array<int, int>|null
     */
    public function accessibleIds(): ?array
    {
        return self::accessibleIdsFor($this->user());
    }

    /**
     * The same rule for any user (policies are handed one): null for a global
     * admin, else their own store plus the stores they manage.
     *
     * @return array<int, int>|null
     */
    public static function accessibleIdsFor(?User $user): ?array
    {
        if ($user === null) {
            return [];
        }

        if ($user->store_id === null && $user->isRole('admin')) {
            return null;
        }

        $managed = FacilityManager::query()
            ->where('user_id', $user->id)
            ->where('facility_type', Store::class)
            ->pluck('facility_id')
            ->map(fn ($id): int => (int) $id);

        return collect([$user->store_id])
            ->filter()
            ->map(fn ($id): int => (int) $id)
            ->merge($managed)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * The store ids a store-scoped query is limited to: null means no limit
     * (global admin on "All stores"); an empty list means nothing at all.
     *
     * @return array<int, int>|null
     */
    public function scopeIds(): ?array
    {
        $id = $this->id();

        if ($id !== null) {
            return [$id];
        }

        return $this->accessibleIds();
    }

    /** Limit a query on its own store column to the active scope. */
    public function apply(Builder $query, string $column = 'store_id'): Builder
    {
        $ids = $this->scopeIds();

        if ($ids === null) {
            return $query;
        }

        return $ids === [] ? $query->whereRaw('1 = 0') : $query->whereIn($column, $ids);
    }

    /** Limit a query through a relation that carries the store column. */
    public function applyThrough(Builder $query, string $relation, string $column = 'store_id'): Builder
    {
        if ($this->scopeIds() === null) {
            return $query;
        }

        return $query->whereHas($relation, fn ($related) => $this->apply($related, $column));
    }

    /** May this user see or touch a record belonging to this store? */
    public function allows(?int $storeId): bool
    {
        $ids = $this->accessibleIds();

        if ($ids === null) {
            return true;
        }

        return $storeId !== null && in_array($storeId, $ids, true);
    }

    /** Is a record of this store inside the current view (not just reachable)? */
    public function covers(?int $storeId): bool
    {
        $ids = $this->scopeIds();

        return $ids === null || ($storeId !== null && in_array($storeId, $ids, true));
    }

    /**
     * The store a new record is written against.
     *
     * A store admin's choice is never trusted: an id outside their stores is
     * replaced by the active store. A global admin may name any store, or
     * leaves it to the active one (null on "All stores").
     */
    public function storeIdForWrite(mixed $requested): ?int
    {
        $requested = is_numeric($requested) ? (int) $requested : null;

        if ($this->isGlobal()) {
            return $requested ?? $this->id();
        }

        return $requested !== null && $this->allows($requested) ? $requested : $this->id();
    }

    /**
     * What the layouts branch on, shared through HandleInertiaRequests.
     *
     * @return array<string, mixed>
     */
    public function toShared(): array
    {
        $id = $this->id();

        return [
            'activeStore' => [
                'id' => $id ?? self::ALL,
                'name' => $id === null ? 'All stores' : ($this->store()?->name ?? 'No store'),
            ],
            'accessibleStores' => $this->accessibleStores()
                ->map(fn (Store $s): array => ['id' => (int) $s->id, 'name' => (string) $s->name, 'type' => (string) $s->type])
                ->values()
                ->all(),
            'isGlobalAdmin' => $this->isGlobal(),
        ];
    }

    /**
     * A requested store as an id, null for "all", or false when the user may
     * not have it (so the caller falls back).
     */
    private function validChoice(string $value): int|null|false
    {
        if ($value === self::ALL) {
            return $this->isGlobal() ? null : false;
        }

        // Names are still accepted so links written while the dashboard
        // switcher sent names keep working.
        if (! ctype_digit($value)) {
            $named = $this->accessibleStores()->firstWhere('name', $value);

            return $named !== null ? (int) $named->id : false;
        }

        $id = (int) $value;

        return $this->accessibleStores()->contains('id', $id) ? $id : false;
    }

    private function defaultId(): ?int
    {
        if ($this->isGlobal()) {
            return null;
        }

        $own = $this->user()?->store_id;
        $stores = $this->accessibleStores();

        if ($own !== null && $stores->contains('id', (int) $own)) {
            return (int) $own;
        }

        // No reachable store at all: an id that matches nothing, so scoped
        // screens come back empty instead of falling open to every store.
        return $stores->first()?->id !== null ? (int) $stores->first()->id : 0;
    }
}
