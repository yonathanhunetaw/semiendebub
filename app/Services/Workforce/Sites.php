<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteHour;
use App\Models\Workforce\SiteHourException;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPermissions;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Sites: the places people open, close, hold a key to and work at.
 *
 * A site is a stock_locations node of kind store (a retail store: its shelf
 * and floor are one building), remote_hub or main_hub. Stores and Remote Hubs
 * have shifts; Main Hubs have a key and open/close only.
 *
 * Who manages a site: a global admin; the admin or store manager of its store;
 * a facility manager of the site (or of its store). Who works at it: its
 * managers, the store's sellers / stock keepers / store managers, and anyone
 * assigned to it as staff.
 */
class Sites
{
    public const KINDS = [StockLocation::KIND_STORE, StockLocation::KIND_REMOTE_HUB, StockLocation::KIND_MAIN_HUB];

    /** Kinds that run shifts and clock-in. */
    public const SHIFT_KINDS = [StockLocation::KIND_STORE, StockLocation::KIND_REMOTE_HUB];

    /** Roles that work at a store's sites. */
    public const STAFF_ROLES = ['seller', 'store_manager', 'stock_keeper', 'admin'];

    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    public function isSite(StockLocation $location): bool
    {
        return in_array($location->kind, self::KINDS, true);
    }

    public function hasShifts(StockLocation $site): bool
    {
        return in_array($site->kind, self::SHIFT_KINDS, true);
    }

    /** @return Builder<StockLocation> */
    public function query(): Builder
    {
        return StockLocation::query()->whereIn('kind', self::KINDS)->orderByRaw(
            "case kind when 'store' then 0 when 'remote_hub' then 1 else 2 end"
        )->orderBy('store_id')->orderBy('name');
    }

    public function isGlobalAdmin(?User $user): bool
    {
        return $user !== null && ($user->isRole('dev') || ($user->isRole('admin') && $user->store_id === null));
    }

    public function canManage(?User $user, StockLocation $site): bool
    {
        if ($user === null || ! $this->isSite($site)) {
            return false;
        }

        if ($this->isGlobalAdmin($user)) {
            return true;
        }

        if ($user->isRole('admin') && $site->store_id !== null
            && in_array((int) $site->store_id, ActiveStore::accessibleIdsFor($user) ?? [], true)) {
            return true;
        }

        return $this->permissions->isManagerOf($user, $site);
    }

    public function worksAt(?User $user, StockLocation $site): bool
    {
        if ($user === null || ! $this->isSite($site)) {
            return false;
        }

        if ($this->canManage($user, $site) || $site->isStaffedBy($user) || $site->isManagedBy($user)) {
            return true;
        }

        return $site->store_id !== null
            && (int) $user->store_id === (int) $site->store_id
            && $user->isRole(...self::STAFF_ROLES);
    }

    /**
     * Sites this user manages.
     *
     * @return Collection<int, StockLocation>
     */
    public function managedBy(User $user): Collection
    {
        return $this->query()->get()->filter(fn (StockLocation $site): bool => $this->canManage($user, $site))->values();
    }

    /**
     * Sites this user works at (manages included).
     *
     * @return Collection<int, StockLocation>
     */
    public function workedAtBy(User $user): Collection
    {
        return $this->query()->get()->filter(fn (StockLocation $site): bool => $this->worksAt($user, $site))->values();
    }

    /**
     * The people who work at a site, for picking who gets the key or a shift.
     *
     * @return Collection<int, User>
     */
    public function people(StockLocation $site): Collection
    {
        $assigned = $site->staffAssignments()->pluck('user_id')
            ->merge($site->managerAssignments()->pluck('user_id'))
            ->merge($site->storeNode()?->managerAssignments()->pluck('user_id') ?? []);

        return User::query()
            ->with('roles')
            ->where(function (Builder $query) use ($site, $assigned): void {
                $query->whereIn('id', $assigned->all());

                if ($site->store_id !== null) {
                    $query->orWhere(fn (Builder $store) => $store
                        ->where('store_id', $site->store_id)
                        ->whereHas('roles', fn (Builder $role) => $role->whereIn('name', self::STAFF_ROLES)));
                } else {
                    // A Main Hub belongs to no store: its stock keepers and the global admins.
                    $query->orWhere(fn (Builder $hub) => $hub
                        ->whereNull('store_id')
                        ->whereHas('roles', fn (Builder $role) => $role->whereIn('name', ['stock_keeper', 'admin'])));
                }
            })
            ->orderBy('first_name')
            ->get()
            ->filter(fn (User $user): bool => $this->worksAt($user, $site))
            ->values();
    }

    /*
    |--------------------------------------------------------------------------
    | Hours
    |--------------------------------------------------------------------------
    */

    /**
     * The site's hours on one date: an exception for that date wins over the
     * weekday. Null when nobody has set hours for that weekday yet.
     *
     * @return array{closed: bool, opens_at: string|null, closes_at: string|null, note: string|null, exception: bool}|null
     */
    public function hoursOn(StockLocation $site, CarbonInterface $date): ?array
    {
        $exception = SiteHourException::query()
            ->where('stock_location_id', $site->id)
            ->whereDate('date', $date->toDateString())
            ->first();

        if ($exception !== null) {
            return [
                'closed' => (bool) $exception->closed,
                'opens_at' => $exception->closed ? null : $this->hm($exception->opens_at),
                'closes_at' => $exception->closed ? null : $this->hm($exception->closes_at),
                'note' => $exception->note,
                'exception' => true,
            ];
        }

        $row = SiteHour::query()->where('stock_location_id', $site->id)->where('weekday', $date->dayOfWeek)->first();

        if ($row === null) {
            return null;
        }

        return [
            'closed' => (bool) $row->closed,
            'opens_at' => $row->closed ? null : $this->hm($row->opens_at),
            'closes_at' => $row->closed ? null : $this->hm($row->closes_at),
            'note' => null,
            'exception' => false,
        ];
    }

    /** Opening time on a date as a moment, or null when closed / unknown. */
    public function opensAt(StockLocation $site, CarbonInterface $date): ?CarbonImmutable
    {
        return $this->moment($date, $this->hoursOn($site, $date)['opens_at'] ?? null);
    }

    public function closesAt(StockLocation $site, CarbonInterface $date): ?CarbonImmutable
    {
        return $this->moment($date, $this->hoursOn($site, $date)['closes_at'] ?? null);
    }

    /**
     * Seven rows, Sunday first, for the setup form.
     *
     * @return array<int, array{weekday: int, closed: bool, opens_at: string|null, closes_at: string|null}>
     */
    public function week(StockLocation $site): array
    {
        $rows = SiteHour::query()->where('stock_location_id', $site->id)->get()->keyBy('weekday');

        return collect(range(0, 6))->map(fn (int $day): array => [
            'weekday' => $day,
            'closed' => (bool) ($rows[$day]->closed ?? false),
            'opens_at' => $this->hm($rows[$day]->opens_at ?? null),
            'closes_at' => $this->hm($rows[$day]->closes_at ?? null),
        ])->all();
    }

    /** @param array<int, array{weekday: int, closed?: bool, opens_at?: string|null, closes_at?: string|null}> $days */
    public function saveWeek(StockLocation $site, array $days): void
    {
        DB::transaction(function () use ($site, $days): void {
            foreach ($days as $day) {
                $closed = (bool) ($day['closed'] ?? false);
                $opens = $closed ? null : ($day['opens_at'] ?? null);
                $closes = $closed ? null : ($day['closes_at'] ?? null);

                if (! $closed && ($opens === null || $closes === null)) {
                    SiteHour::query()->where('stock_location_id', $site->id)->where('weekday', $day['weekday'])->delete();

                    continue;
                }

                SiteHour::query()->updateOrCreate(
                    ['stock_location_id' => $site->id, 'weekday' => (int) $day['weekday']],
                    ['closed' => $closed, 'opens_at' => $opens, 'closes_at' => $closes],
                );
            }
        });
    }

    private function moment(CarbonInterface $date, ?string $time): ?CarbonImmutable
    {
        return $time === null ? null : CarbonImmutable::parse($date->toDateString().' '.$time);
    }

    private function hm(mixed $time): ?string
    {
        return $time === null || $time === '' ? null : substr((string) $time, 0, 5);
    }
}
