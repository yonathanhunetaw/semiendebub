<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\FacilityManager;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;

/**
 * Who may do what with a store's shelf and its refills — the one definition.
 *
 * The policies, the controllers and the read-only "Who can do what" pages all
 * read from here, so a page cannot describe a rule the code does not enforce.
 *
 * Managers. A location's managers are the users assigned to it in
 * facility_managers — any number, each with their own tick boxes
 * (FacilityManager::ABILITIES). A manager may do a thing only while that tick
 * is on. A store's managers are managers of everything in it — its shelf,
 * floor and Remote Hub — with the same ticks; managers can also be assigned to
 * one of those directly. "Manager" is never a role test: a seller or a stock
 * keeper can be one.
 *
 * Stock keepers. The stock keepers of a location are those assigned to it in
 * location_staff (staff of a store are staff of all of it). They raise refill
 * suggestions and shelve; nothing else. Until anyone is assigned to a store,
 * its stock keepers are those whose users.store_id names it, as before.
 *
 * Admin and dev may always act. A shelf nobody manages has its planogram run
 * by admin/dev only.
 */
class StockPermissions
{
    public const VIEW_SHELF = 'view_shelf';

    public const RAISE_REFILL = 'raise_refill';

    public const EDIT_PLANOGRAM = FacilityManager::EDIT_PLANOGRAM;

    public const SET_REFILL_ROUTE = FacilityManager::SET_REFILL_ROUTES;

    public const ADD_TO_REMOTE_LIST = FacilityManager::ADD_TO_REMOTE_LIST;

    public const ADD_TO_MANIFEST = FacilityManager::ADD_TO_MANIFEST;

    public const ADJUST_CANCEL = FacilityManager::ADJUST_CANCEL_REQUESTS;

    public const ACCEPT_AT_REMOTE = FacilityManager::ACCEPT_AT_REMOTE;

    public const SHELVE = FacilityManager::SHELVE;

    /** Human labels for the manager tick boxes, in FacilityManager::ABILITIES order. */
    public const TICK_LABELS = [
        FacilityManager::EDIT_PLANOGRAM => 'Edit planogram',
        FacilityManager::SET_REFILL_ROUTES => 'Set refill routes',
        FacilityManager::ADD_TO_REMOTE_LIST => 'Add to Remote Hub list',
        FacilityManager::ADD_TO_MANIFEST => 'Add to shipment manifest',
        FacilityManager::ADJUST_CANCEL_REQUESTS => 'Adjust / cancel requests',
        FacilityManager::ACCEPT_AT_REMOTE => 'Accept at Remote Hub',
        FacilityManager::SHELVE => 'Shelve',
    ];

    /**
     * Every action, as the "Who can do what" page lists it. `who` keys are
     * seller, stock_keeper, location_manager, store_manager, admin; a value is
     * true (may), false (may not) or a short string qualifying the yes.
     * `tick` names the manager tick box that governs it, if any.
     *
     * @return array<int, array{key: string, label: string, description: string, tick: string|null, who: array<string, bool|string>}>
     */
    public static function catalogue(): array
    {
        $ticked = 'if ticked';

        return [
            [
                'key' => self::VIEW_SHELF,
                'label' => 'View a shelf',
                'description' => 'See which items sit on a Store Shelf, how much of each, and its refill and crit-low lines.',
                'tick' => null,
                'who' => ['seller' => 'own store', 'stock_keeper' => 'own store', 'location_manager' => true, 'store_manager' => true, 'admin' => true],
            ],
            [
                'key' => self::RAISE_REFILL,
                'label' => 'Suggest a refill',
                'description' => 'Ask for a bin to be refilled. Suggestions are also raised automatically at the refill line. What the store floor can give goes straight to the shelving list; the rest waits for a store manager.',
                'tick' => null,
                'who' => ['seller' => false, 'stock_keeper' => 'assigned', 'location_manager' => true, 'store_manager' => true, 'admin' => true],
            ],
            [
                'key' => self::EDIT_PLANOGRAM,
                'label' => self::TICK_LABELS[FacilityManager::EDIT_PLANOGRAM],
                'description' => 'Assign or remove items on a shelf (or a Remote Hub\'s lines), and set max, refill line and crit low.',
                'tick' => FacilityManager::EDIT_PLANOGRAM,
                'who' => ['seller' => false, 'stock_keeper' => false, 'location_manager' => $ticked, 'store_manager' => $ticked, 'admin' => true],
            ],
            [
                'key' => self::SET_REFILL_ROUTE,
                'label' => self::TICK_LABELS[FacilityManager::SET_REFILL_ROUTES],
                'description' => 'Choose, per item, which sources a refill may come from: store floor, Remote Hub, shipment.',
                'tick' => FacilityManager::SET_REFILL_ROUTES,
                'who' => ['seller' => false, 'stock_keeper' => false, 'location_manager' => false, 'store_manager' => $ticked, 'admin' => true],
            ],
            [
                'key' => self::ADD_TO_REMOTE_LIST,
                'label' => self::TICK_LABELS[FacilityManager::ADD_TO_REMOTE_LIST],
                'description' => 'Take a refill suggestion and put it on the Remote Hub → Store list. Doing so is the approval.',
                'tick' => FacilityManager::ADD_TO_REMOTE_LIST,
                'who' => ['seller' => false, 'stock_keeper' => false, 'location_manager' => false, 'store_manager' => $ticked, 'admin' => true],
            ],
            [
                'key' => self::ADD_TO_MANIFEST,
                'label' => self::TICK_LABELS[FacilityManager::ADD_TO_MANIFEST],
                'description' => 'Take refill suggestions onto a shipment manifest from Hub A/B, to the store floor or to its Remote Hub.',
                'tick' => FacilityManager::ADD_TO_MANIFEST,
                'who' => ['seller' => false, 'stock_keeper' => false, 'location_manager' => false, 'store_manager' => $ticked, 'admin' => true],
            ],
            [
                'key' => self::ADJUST_CANCEL,
                'label' => self::TICK_LABELS[FacilityManager::ADJUST_CANCEL_REQUESTS],
                'description' => 'Change how much of a suggestion is sent, or cancel it with a reason. The stock keeper sees either.',
                'tick' => FacilityManager::ADJUST_CANCEL_REQUESTS,
                'who' => ['seller' => false, 'stock_keeper' => false, 'location_manager' => false, 'store_manager' => $ticked, 'admin' => true],
            ],
            [
                'key' => self::ACCEPT_AT_REMOTE,
                'label' => self::TICK_LABELS[FacilityManager::ACCEPT_AT_REMOTE],
                'description' => 'Agree to send a Remote Hub → Store refill; a courier then carries it.',
                'tick' => FacilityManager::ACCEPT_AT_REMOTE,
                'who' => ['seller' => false, 'stock_keeper' => 'assigned to the hub', 'location_manager' => $ticked, 'store_manager' => $ticked, 'admin' => true],
            ],
            [
                'key' => self::SHELVE,
                'label' => self::TICK_LABELS[FacilityManager::SHELVE],
                'description' => 'Carry a floor → shelf transfer across. Same site, no courier, no approval.',
                'tick' => FacilityManager::SHELVE,
                'who' => ['seller' => false, 'stock_keeper' => 'assigned', 'location_manager' => $ticked, 'store_manager' => $ticked, 'admin' => true],
            ],
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | The building blocks
    |--------------------------------------------------------------------------
    */

    public function isAdmin(?User $user): bool
    {
        return $user !== null && in_array($user->roleKey(), ['admin', 'dev'], true);
    }

    /**
     * Has this user this tick at this location — directly, or as a manager of
     * the store it belongs to? A store node answers for itself.
     */
    public function managerAllows(?User $user, StockLocation $location, string $ability): bool
    {
        if ($user === null) {
            return false;
        }

        if ($this->isAdmin($user)) {
            return true;
        }

        foreach (array_filter([$location, $location->storeNode()]) as $node) {
            if ($node->managerAssignmentFor($user)?->allows($ability)) {
                return true;
            }
        }

        $storeId = $location->store_id !== null ? (int) $location->store_id : null;

        return $storeId !== null && $this->legacyStoreManager($user, $storeId, $ability);
    }

    /** Manager of this location, or of its store, with any tick. */
    public function isManagerOf(?User $user, StockLocation $location): bool
    {
        if ($user === null) {
            return false;
        }

        foreach (array_filter([$location, $location->storeNode()]) as $node) {
            if ($node->managerAssignmentFor($user) !== null) {
                return true;
            }
        }

        return $location->store_id !== null && $this->legacyStoreManager($user, (int) $location->store_id);
    }

    /**
     * Is this user a stock keeper of this location? Assigned to it or to its
     * store; or, while nobody is assigned to either, a stock keeper whose
     * users.store_id names its store.
     */
    public function isStaffOf(?User $user, StockLocation $location): bool
    {
        if ($user === null) {
            return false;
        }

        $nodes = array_filter([$location, $location->storeNode()]);
        $anyAssigned = false;

        foreach ($nodes as $node) {
            if ($node->isStaffedBy($user)) {
                return true;
            }

            $anyAssigned = $anyAssigned || $node->staffAssignments()->exists();
        }

        return ! $anyAssigned
            && $user->isRole('stock_keeper')
            && $this->belongsToStore($user, $location->store_id);
    }

    /** The store's group node, which carries its store-wide managers and staff. */
    public function storeNode(int $storeId): ?StockLocation
    {
        return StockLocation::query()->where('store_id', $storeId)->where('kind', StockLocation::KIND_STORE)->first();
    }

    /*
    |--------------------------------------------------------------------------
    | Abilities
    |--------------------------------------------------------------------------
    */

    /** Sellers and stock keepers of the shelf's store, its managers, and admins. */
    public function canViewShelf(?User $user, StockLocation $shelf): bool
    {
        if ($user === null || $shelf->kind !== StockLocation::KIND_SHELF) {
            return false;
        }

        return $this->isAdmin($user)
            || $this->isManagerOf($user, $shelf)
            || $this->isStaffOf($user, $shelf)
            || $this->belongsToStore($user, $shelf->store_id);
    }

    /** Assign items and set lines on a shelf or a Remote Hub. Never anyone's when unmanaged. */
    public function canEditPlanogram(?User $user, StockLocation $location): bool
    {
        if ($user === null || ! in_array($location->kind, [StockLocation::KIND_SHELF, StockLocation::KIND_REMOTE_HUB], true)) {
            return false;
        }

        return $this->managerAllows($user, $location, FacilityManager::EDIT_PLANOGRAM);
    }

    public function canSetRefillRoute(?User $user, int $storeId): bool
    {
        return $this->storeAllows($user, $storeId, FacilityManager::SET_REFILL_ROUTES);
    }

    /** Suggest a refill: the location's stock keepers and managers. */
    public function canRaiseRefill(?User $user, StockLocation $location): bool
    {
        if ($user === null || ! in_array($location->kind, [StockLocation::KIND_SHELF, StockLocation::KIND_REMOTE_HUB], true)) {
            return false;
        }

        return $this->isAdmin($user)
            || $this->isManagerOf($user, $location)
            || $this->isStaffOf($user, $location);
    }

    /** Carry a floor → shelf transfer: the store's stock keepers, managers with the tick. */
    public function canShelve(?User $user, StockLocation $shelf): bool
    {
        if ($user === null || $shelf->kind !== StockLocation::KIND_SHELF) {
            return false;
        }

        if ($this->managerAllows($user, $shelf, FacilityManager::SHELVE) || $this->isStaffOf($user, $shelf)) {
            return true;
        }

        $floor = $this->floorOf($shelf);

        return $floor !== null && $this->managerAllows($user, $floor, FacilityManager::SHELVE);
    }

    public function canAddToRemoteList(?User $user, int $storeId): bool
    {
        return $this->storeAllows($user, $storeId, FacilityManager::ADD_TO_REMOTE_LIST);
    }

    public function canAddToManifest(?User $user, int $storeId): bool
    {
        return $this->storeAllows($user, $storeId, FacilityManager::ADD_TO_MANIFEST);
    }

    public function canAdjustOrCancel(?User $user, int $storeId): bool
    {
        return $this->storeAllows($user, $storeId, FacilityManager::ADJUST_CANCEL_REQUESTS);
    }

    /** Act on suggestions at all: any one of the three store-manager ticks. */
    public function canRuleOnRefills(?User $user, int $storeId): bool
    {
        return $this->canAddToRemoteList($user, $storeId)
            || $this->canAddToManifest($user, $storeId)
            || $this->canAdjustOrCancel($user, $storeId);
    }

    public function canAcceptAtRemote(?User $user, StockLocation $remoteHub): bool
    {
        if ($user === null || $remoteHub->kind !== StockLocation::KIND_REMOTE_HUB) {
            return false;
        }

        return $this->managerAllows($user, $remoteHub, FacilityManager::ACCEPT_AT_REMOTE)
            || $this->isStaffOf($user, $remoteHub);
    }

    /**
     * Does this user manage the store as a whole (any tick)? A manager of its
     * store node, of the legacy Store facility, or a `store_manager` whose
     * store it is.
     */
    public function isStoreManager(?User $user, ?int $storeId): bool
    {
        if ($user === null || $storeId === null) {
            return false;
        }

        return $this->storeNode($storeId)?->managerAssignmentFor($user) !== null
            || $this->legacyStoreManager($user, $storeId);
    }

    /*
    |--------------------------------------------------------------------------
    | Presenting
    |--------------------------------------------------------------------------
    */

    /**
     * The people who run a store and what each may do, for the read-only page.
     *
     * @return array<int, array{name: string, role: string, where: string, ticks: array<int, string>}>
     */
    public function peopleOf(int $storeId): array
    {
        $node = $this->storeNode($storeId);

        if ($node === null) {
            return [];
        }

        $locations = StockLocation::query()->where('id', $node->id)->orWhere('parent_id', $node->id)->get();
        $people = [];

        foreach ($locations as $location) {
            $where = $location->kind === StockLocation::KIND_STORE ? 'Whole store' : $location->kind_label;

            foreach ($location->managerAssignments()->with('user')->get() as $assignment) {
                if ($assignment->user === null) {
                    continue;
                }

                $people[] = [
                    'name' => $this->nameOf($assignment->user),
                    'role' => 'Manager',
                    'where' => $where,
                    'ticks' => $assignment->grantedAbilities(),
                ];
            }

            foreach ($location->staffAssignments()->with('user')->get() as $staff) {
                if ($staff->user === null) {
                    continue;
                }

                $people[] = [
                    'name' => $this->nameOf($staff->user),
                    'role' => 'Stock keeper',
                    'where' => $where,
                    'ticks' => [],
                ];
            }
        }

        return $people;
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    private function storeAllows(?User $user, int $storeId, string $ability): bool
    {
        if ($user === null) {
            return false;
        }

        if ($this->isAdmin($user)) {
            return true;
        }

        $node = $this->storeNode($storeId);

        return ($node?->managerAssignmentFor($user)?->allows($ability) ?? false)
            || $this->legacyStoreManager($user, $storeId, $ability);
    }

    /**
     * Store managers from before location ticks existed: the legacy Store
     * facility's managers (their own ticks apply) and a `store_manager` whose
     * store it is (every tick). With no ability given, any tick will do.
     */
    private function legacyStoreManager(User $user, int $storeId, ?string $ability = null): bool
    {
        $assignment = Store::query()->find($storeId)?->managerAssignmentFor($user);

        if ($assignment !== null && ($ability === null || $assignment->allows($ability))) {
            return true;
        }

        return $user->isRole('store_manager') && $this->belongsToStore($user, $storeId);
    }

    private function belongsToStore(User $user, ?int $storeId): bool
    {
        return $storeId !== null && $user->store_id !== null && (int) $user->store_id === $storeId;
    }

    private function floorOf(StockLocation $shelf): ?StockLocation
    {
        return StockLocation::query()
            ->where('parent_id', $shelf->parent_id)
            ->where('kind', StockLocation::KIND_BACKROOM)
            ->first();
    }

    private function nameOf(User $user): string
    {
        return trim($user->first_name.' '.$user->last_name) ?: (string) $user->email;
    }
}
