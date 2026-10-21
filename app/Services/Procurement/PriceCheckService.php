<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\ProductIdeaException;
use App\Models\Auth\User;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\PriceObservation;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\Shop;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPermissions;
use App\Services\Workforce\LocalTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Price checks (docs/plans/procurement-pipeline.md, PP2).
 *
 * A store admin (or a global admin) opens a check on an idea or an existing
 * item for one store: how many shops, by when, and optionally which sellers.
 * Those sellers (or, when none are named, any seller or store manager of the
 * store) record what the item sells for at the store's "check" shops; an
 * "avoid" shop or one the store has not listed is refused. Each price is
 * verified or rejected by someone other than whoever recorded it: the
 * store's admin, a manager of the store, or a global admin. Only verified
 * prices count in the summary procurement sees; sellers never see the
 * summary, only the prices they recorded themselves.
 */
class PriceCheckService
{
    private const STAFF = ['seller', 'store_manager'];

    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    /*
    |--------------------------------------------------------------------------
    | Opening and closing
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<int, int>  $assigneeIds
     *
     * @throws ProductIdeaException
     */
    public function open(
        User $by,
        int $storeId,
        ?ProductIdea $idea = null,
        ?int $itemId = null,
        int $shopsWanted = 3,
        ?string $dueOn = null,
        array $assigneeIds = [],
        ?string $note = null,
    ): PriceCheck {
        if (($idea === null) === ($itemId === null)) {
            throw new ProductIdeaException('A price check is for one idea or one item.');
        }

        if (! $this->permissions->isAdminOf($by, $storeId)) {
            throw new ProductIdeaException("Only this store's admin or a global admin can open a price check here.", 403);
        }

        if ($idea !== null && $idea->store_id !== null && (int) $idea->store_id !== $storeId) {
            throw new ProductIdeaException('This idea is for another store.');
        }

        $assigneeIds = array_values(array_unique(array_map('intval', $assigneeIds)));
        $staff = User::query()->whereKey($assigneeIds)->where('store_id', $storeId)->get()
            ->filter(fn (User $user): bool => in_array($user->roleKey(), self::STAFF, true));

        if ($staff->count() !== count($assigneeIds)) {
            throw new ProductIdeaException('Only sellers and managers of this store can be named on its price check.');
        }

        $existing = PriceCheck::query()
            ->where('store_id', $storeId)
            ->when($idea !== null, fn (Builder $q) => $q->where('product_idea_id', $idea->id), fn (Builder $q) => $q->where('item_id', $itemId))
            ->where('status', PriceCheck::OPEN)
            ->exists();

        if ($existing) {
            throw new ProductIdeaException('This store already has an open price check for it.');
        }

        return DB::transaction(function () use ($by, $storeId, $idea, $itemId, $shopsWanted, $dueOn, $staff, $note): PriceCheck {
            $check = PriceCheck::query()->create([
                'store_id' => $storeId,
                'product_idea_id' => $idea?->id,
                'item_id' => $itemId,
                'shops_wanted' => max(1, min(50, $shopsWanted)),
                'due_on' => $dueOn,
                'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
                'status' => PriceCheck::OPEN,
                'created_by' => $by->id,
            ]);

            $check->assignees()->sync($staff->pluck('id')->all());

            return $check;
        });
    }

    /** @throws ProductIdeaException */
    public function close(PriceCheck $check, User $by): PriceCheck
    {
        if (! $this->mayManage($by, $check)) {
            throw new ProductIdeaException("Only this store's admin or a global admin can close its price check.", 403);
        }

        $check->update(['status' => PriceCheck::CLOSED, 'closed_by' => $by->id, 'closed_at' => now()]);

        return $check->refresh();
    }

    public function reopen(PriceCheck $check): PriceCheck
    {
        $check->update(['status' => PriceCheck::OPEN, 'closed_by' => null, 'closed_at' => null]);

        return $check->refresh();
    }

    public function mayManage(?User $user, PriceCheck $check): bool
    {
        return $this->permissions->isAdminOf($user, (int) $check->store_id);
    }

    /*
    |--------------------------------------------------------------------------
    | Recording
    |--------------------------------------------------------------------------
    */

    public function mayRecord(?User $user, PriceCheck $check): bool
    {
        if ($user === null || $check->status !== PriceCheck::OPEN) {
            return false;
        }

        if ($this->permissions->isAdminOf($user, (int) $check->store_id)) {
            return true;
        }

        if (! in_array($user->roleKey(), self::STAFF, true) || (int) $user->store_id !== (int) $check->store_id) {
            return false;
        }

        $named = $check->relationLoaded('assignees') ? $check->assignees : $check->assignees()->get();

        return $named->isEmpty() || $named->contains('id', $user->id);
    }

    /**
     * @param  array{shop_id: int|string, observed_on?: ?string, pack_type: string, pieces_per_pack?: int|string|null, min_qty?: int|string|null, price: float|int|string, note?: ?string}  $data
     *
     * @throws ProductIdeaException
     */
    public function record(PriceCheck $check, User $by, array $data): PriceObservation
    {
        if ($check->status !== PriceCheck::OPEN) {
            throw new ProductIdeaException('This price check is closed.');
        }

        if (! $this->mayRecord($by, $check)) {
            throw new ProductIdeaException('This price check is not yours to fill in.', 403);
        }

        $shopId = (int) $data['shop_id'];

        if (! $this->checkShops((int) $check->store_id)->contains('id', $shopId)) {
            throw new ProductIdeaException('That shop is not on this store\'s list of shops to check.');
        }

        $packType = (string) $data['pack_type'];
        $perPack = $packType === 'piece' ? 1 : max(1, (int) ($data['pieces_per_pack'] ?? 1));
        $minQty = max(1, (int) ($data['min_qty'] ?? 1));
        $price = round((float) $data['price'], 2);

        $twin = $check->observations()->standing()
            ->where('shop_id', $shopId)->where('pack_type', $packType)
            ->where('pieces_per_pack', $perPack)->where('min_qty', $minQty)
            ->exists();

        if ($twin) {
            throw new ProductIdeaException('That price at that shop is already written down. Ask for it to be rejected if it is wrong.');
        }

        return $check->observations()->create([
            'shop_id' => $shopId,
            'recorded_by' => $by->id,
            'observed_on' => $data['observed_on'] ?? LocalTime::dateOf(),
            'pack_type' => $packType,
            'pieces_per_pack' => $perPack,
            'min_qty' => $minQty,
            'price' => $price,
            'price_per_piece' => round($price / $perPack, 4),
            'note' => isset($data['note']) && trim((string) $data['note']) !== '' ? trim((string) $data['note']) : null,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Verifying
    |--------------------------------------------------------------------------
    */

    public function mayVerify(?User $user, PriceObservation $observation): bool
    {
        if ($user === null || $observation->state() !== PriceObservation::PENDING || (int) $observation->recorded_by === (int) $user->id) {
            return false;
        }

        $storeId = (int) $observation->check->store_id;

        return $this->permissions->isAdminOf($user, $storeId) || $this->permissions->isStoreManager($user, $storeId);
    }

    /** @throws ProductIdeaException */
    public function verify(PriceObservation $observation, User $by): PriceObservation
    {
        return $this->settle($observation, $by, function (PriceObservation $row) use ($by): void {
            $row->update(['verified_by' => $by->id, 'verified_at' => now()]);
        });
    }

    /** @throws ProductIdeaException */
    public function reject(PriceObservation $observation, User $by, string $reason): PriceObservation
    {
        if (trim($reason) === '') {
            throw new ProductIdeaException('Say why the price is wrong.');
        }

        return $this->settle($observation, $by, function (PriceObservation $row) use ($by, $reason): void {
            $row->update(['rejected_by' => $by->id, 'rejected_at' => now(), 'reject_reason' => trim($reason)]);
        });
    }

    /**
     * @param  callable(PriceObservation): void  $change
     *
     * @throws ProductIdeaException
     */
    private function settle(PriceObservation $observation, User $by, callable $change): PriceObservation
    {
        return DB::transaction(function () use ($observation, $by, $change): PriceObservation {
            /** @var PriceObservation $row */
            $row = PriceObservation::query()->with('check')->lockForUpdate()->findOrFail($observation->id);

            if ($row->state() !== PriceObservation::PENDING) {
                throw new ProductIdeaException('This price was already '.$row->state().'.');
            }

            if ((int) $row->recorded_by === (int) $by->id) {
                throw new ProductIdeaException('Someone other than whoever wrote the price down checks it.', 403);
            }

            if (! $this->mayVerify($by, $row)) {
                throw new ProductIdeaException("Only the store's admin, a manager of the store or a global admin checks prices.", 403);
            }

            $change($row);

            return $row->refresh();
        });
    }

    /**
     * Who this admin can name on a price check: the sellers and managers of
     * the stores they run, by store id.
     *
     * @return array<int, array<int, array{id: int, name: string}>>
     */
    public function nameableStaff(?User $admin): array
    {
        if ($admin === null || ! in_array($admin->roleKey(), ['admin', 'dev'], true)) {
            return [];
        }

        $ids = $this->permissions->isGlobalAdmin($admin) ? null : (ActiveStore::accessibleIdsFor($admin) ?? []);

        return User::query()
            ->whereNotNull('store_id')
            ->when($ids !== null, fn (Builder $q) => $q->whereIn('store_id', $ids))
            ->whereHas('roles', fn (Builder $q) => $q->whereIn('name', self::STAFF))
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email', 'store_id'])
            ->groupBy('store_id')
            ->map(fn (Collection $users): array => $users->map(fn (User $u): array => ['id' => (int) $u->id, 'name' => self::name($u)])->values()->all())
            ->all();
    }

    /*
    |--------------------------------------------------------------------------
    | Shops
    |--------------------------------------------------------------------------
    */

    /**
     * The shops this store's sellers check: active and marked "check".
     *
     * @return Collection<int, Shop>
     */
    public function checkShops(int $storeId): Collection
    {
        return Shop::query()
            ->where('is_active', true)
            ->whereHas('stores', fn (Builder $q) => $q->where('stores.id', $storeId)->where('store_shops.mode', Shop::CHECK))
            ->orderBy('name')
            ->get();
    }

    /*
    |--------------------------------------------------------------------------
    | Seeing
    |--------------------------------------------------------------------------
    */

    /**
     * Global admins, dev and procurement see every check; a store admin the
     * stores they run; sellers and store managers their own store's checks
     * that name nobody or name them.
     *
     * @param  Builder<PriceCheck>  $query
     * @return Builder<PriceCheck>
     */
    public function visibleTo(Builder $query, ?User $user): Builder
    {
        if ($user === null) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->roleKey() === 'procurement' || $this->permissions->isGlobalAdmin($user)) {
            return $query;
        }

        if ($user->roleKey() === 'admin') {
            return $query->whereIn('store_id', ActiveStore::accessibleIdsFor($user) ?? []);
        }

        if ($user->store_id === null) {
            return $query->whereRaw('1 = 0');
        }

        $query->where('store_id', $user->store_id);

        // A store manager checks the prices, so sees every check of the store.
        if ($user->roleKey() === 'store_manager') {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q->whereDoesntHave('assignees')
            ->orWhereHas('assignees', fn (Builder $a) => $a->where('users.id', $user->id)));
    }

    /** Sees the prices everyone recorded, and the summary: everyone but sellers. */
    public function seesAllPrices(?User $user): bool
    {
        return $user !== null && $user->roleKey() !== 'seller';
    }

    /**
     * Verified prices per piece: how many shops, the lowest and the median,
     * overall and per quantity (in pieces) the price holds from.
     *
     * @param  Collection<int, PriceObservation>  $observations
     * @return array{shops: int, prices: int, lowest: ?float, median: ?float, tiers: array<int, array{from_pieces: int, prices: int, lowest: float, median: float}>}
     */
    public static function summary(Collection $observations): array
    {
        $verified = $observations->filter(fn (PriceObservation $o): bool => $o->verified_at !== null)->values();
        $perPiece = $verified->map(fn (PriceObservation $o): float => (float) $o->price_per_piece);

        $tiers = $verified
            ->groupBy(fn (PriceObservation $o): int => (int) $o->min_qty * (int) $o->pieces_per_pack)
            ->sortKeys()
            ->map(fn (Collection $rows, int $from): array => [
                'from_pieces' => $from,
                'prices' => $rows->count(),
                'lowest' => round((float) $rows->min(fn (PriceObservation $o) => (float) $o->price_per_piece), 2),
                'median' => round(self::median($rows->map(fn (PriceObservation $o): float => (float) $o->price_per_piece)), 2),
            ])
            ->values()
            ->all();

        return [
            'shops' => $verified->pluck('shop_id')->unique()->count(),
            'prices' => $verified->count(),
            'lowest' => $perPiece->isEmpty() ? null : round((float) $perPiece->min(), 2),
            'median' => $perPiece->isEmpty() ? null : round(self::median($perPiece), 2),
            'tiers' => $tiers,
        ];
    }

    /** @param  Collection<int, float>  $values */
    private static function median(Collection $values): float
    {
        $sorted = $values->sort()->values();
        $n = $sorted->count();

        if ($n === 0) {
            return 0.0;
        }

        return $n % 2 === 1 ? (float) $sorted[intdiv($n, 2)] : ((float) $sorted[$n / 2 - 1] + (float) $sorted[$n / 2]) / 2;
    }

    /**
     * @return array<string, mixed>
     */
    public function present(PriceCheck $check, ?User $viewer): array
    {
        $check->loadMissing(['store', 'idea', 'item', 'assignees', 'observations.shop', 'observations.recorder', 'observations.check']);

        $all = $this->seesAllPrices($viewer);
        $shops = $this->checkShops((int) $check->store_id);
        $standing = $check->observations->whereNull('rejected_at');
        $done = $standing->pluck('shop_id')->unique();

        $observations = $check->observations
            ->filter(fn (PriceObservation $o): bool => $all || (int) $o->recorded_by === (int) $viewer?->id)
            ->sortByDesc('id')
            ->values();

        return [
            'id' => (int) $check->id,
            'subject' => $check->subject(),
            'idea_id' => $check->product_idea_id !== null ? (int) $check->product_idea_id : null,
            'item_id' => $check->item_id !== null ? (int) $check->item_id : null,
            'store' => ['id' => (int) $check->store_id, 'name' => (string) ($check->store?->name ?? '')],
            'spec' => $check->idea?->spec,
            'target_price' => $check->idea?->target_price !== null ? (float) $check->idea->target_price : null,
            'shops_wanted' => (int) $check->shops_wanted,
            'shops_done' => $done->count(),
            'due_on' => $check->due_on?->toDateString(),
            'note' => $check->note,
            'status' => (string) $check->status,
            'assignees' => $check->assignees->map(fn (User $u): string => self::name($u))->values()->all(),
            'shops' => $shops->map(fn (Shop $shop): array => [
                'id' => (int) $shop->id,
                'name' => (string) $shop->name,
                'area' => $shop->area,
                'done' => $done->contains($shop->id),
            ])->values()->all(),
            'observations' => $observations->map(fn (PriceObservation $o): array => [
                'id' => (int) $o->id,
                'shop' => (string) ($o->shop?->name ?? ''),
                'observed_on' => $o->observed_on?->toDateString(),
                'pack_type' => (string) $o->pack_type,
                'pieces_per_pack' => (int) $o->pieces_per_pack,
                'min_qty' => (int) $o->min_qty,
                'price' => (float) $o->price,
                'price_per_piece' => (float) $o->price_per_piece,
                'note' => $o->note,
                'recorded_by' => self::name($o->recorder),
                'state' => $o->state(),
                'reject_reason' => $o->reject_reason,
                'can_verify' => $this->mayVerify($viewer, $o),
            ])->all(),
            'can_record' => $this->mayRecord($viewer, $check),
            'can_manage' => $this->mayManage($viewer, $check),
            'summary' => $all ? self::summary($check->observations) : null,
        ];
    }

    private static function name(?User $user): string
    {
        if ($user === null) {
            return '';
        }

        return trim($user->first_name.' '.$user->last_name) ?: (string) $user->email;
    }
}
