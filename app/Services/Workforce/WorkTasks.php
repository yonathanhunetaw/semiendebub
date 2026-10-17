<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\TimeEntry;
use Illuminate\Support\Facades\Route;

/**
 * The bell's work tasks (TaskInbox): keys to accept, sites to open or close,
 * shifts to accept, clock-outs nobody made. Live counts, like every bell task.
 */
class WorkTasks
{
    public function __construct(
        private readonly KeyCustodyService $keys,
        private readonly Sites $sites,
        private readonly SiteDayService $days,
        private readonly RotaService $rota,
    ) {
    }

    /**
     * @return array<int, array{id: string, kind: string, title: string, detail: string, count: int, href: string|null, urgent: bool}>
     */
    public function for(User $user): array
    {
        $tasks = [];
        $href = $this->workUrl($user);

        $waiting = $this->keys->waitingFor($user);
        if ($waiting->isNotEmpty()) {
            $first = $waiting->first();
            $tasks[] = $this->task('accept-keys', 'key', 'Accept a key', sprintf(
                '%s handed you the %s%s. Accept it once it is in your hand.',
                trim(($first->from?->first_name ?? 'Someone').' '.($first->from?->last_name ?? '')),
                $first->key?->label() ?? 'key',
                $waiting->count() > 1 ? sprintf(' (+%d more)', $waiting->count() - 1) : '',
            ), $waiting->count(), $href, true);
        }

        // Shifts sent to me that I have not accepted.
        $toAccept = Shift::query()->where('user_id', $user->id)->where('status', Shift::STATUS_PUBLISHED)->where('ends_at', '>', now())->count();
        if ($toAccept > 0) {
            $tasks[] = $this->task('accept-shifts', 'shift', 'Accept your shifts', sprintf(
                '%d shift%s waiting for you to accept, or to ask for a change.',
                $toAccept, $toAccept === 1 ? '' : 's',
            ), $toAccept, $href, true);
        }

        // Managers: change requests, unaccepted shifts and coverage gaps in the next 7 days.
        $managed = $user->isRole('admin', 'dev', 'store_manager') || $user->facilityAssignments()->exists()
            ? $this->sites->managedBy($user)->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))
            : collect();

        $ids = $managed->pluck('id');

        if ($ids->isNotEmpty()) {
            $soon = Shift::query()->whereIn('stock_location_id', $ids)->where('ends_at', '>', now())->where('starts_at', '<', now()->addDays(7));

            $changes = (clone $soon)->where('status', Shift::STATUS_CHANGE_REQUESTED)->count();
            if ($changes > 0) {
                $tasks[] = $this->task('shift-changes', 'shift', 'Shift change requests', "{$changes} shift(s) someone asked to change.", $changes, $this->sitesUrl($user), true);
            }

            $unaccepted = (clone $soon)->where('status', Shift::STATUS_PUBLISHED)->count();
            if ($unaccepted > 0) {
                $tasks[] = $this->task('unaccepted-shifts', 'shift', 'Shifts not accepted yet', "{$unaccepted} shift(s) in the next 7 days not accepted.", $unaccepted, $this->sitesUrl($user));
            }

            $gaps = $managed->sum(fn (StockLocation $site): int => count($this->rota->coverage($site, now(), now()->addDays(6))));
            if ($gaps > 0) {
                $tasks[] = $this->task('coverage-gaps', 'warning', 'Short of staff', "{$gaps} stretch(es) in the next 7 days below the staffing rules.", $gaps, $this->sitesUrl($user));
            }
        }

        // Still clocked in well after the shift (or a long day without one).
        $open = TimeEntry::query()->open()->with(['site', 'shift'])->where('user_id', $user->id)->first();
        if ($open !== null) {
            $over = $open->shift !== null
                ? now()->greaterThan($open->shift->ends_at->copy()->addMinutes(30))
                : now()->greaterThan($open->clock_in_at->copy()->addHours(10));
            if ($over) {
                $tasks[] = $this->task('still-clocked-in', 'shift', 'Clock out', sprintf(
                    'You are still clocked in at %s since %s. Scan the counter screen to clock out.',
                    $open->site?->name ?? 'your site',
                    $open->clock_in_at->format('H:i'),
                ), 1, $href, true);
            }
        }

        if ($ids->isNotEmpty()) {
            $review = TimeEntry::query()->whereIn('stock_location_id', $ids)
                ->whereNull('reviewed_at')
                ->where('clock_in_at', '>', now()->subDays(14))
                ->whereJsonContains('flags', TimeEntry::FLAG_AUTO_CLOSED)
                ->count();
            if ($review > 0) {
                $tasks[] = $this->task('clock-review', 'shift', 'Clock-outs nobody made', "{$review} clock-in(s) the system closed. Check the times.", $review, $this->sitesUrl($user));
            }
        }

        // Read-only: the bell runs on every page, so it never creates site days.
        $today = SiteDay::query()->with('site')->whereDate('date', now()->toDateString())->get();

        foreach ($today->where('opener_id', $user->id)->whereIn('status', [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED]) as $day) {
            $opens = $day->site ? $this->sites->opensAt($day->site, now()) : null;
            $tasks[] = $this->task("open-site-{$day->stock_location_id}", 'site', $day->status === SiteDay::STATUS_MISSED ? 'Open the site: late' : 'You open today', sprintf(
                '%s opens%s. Scan the QR at the counter to open it.',
                $day->site?->name ?? 'Your site',
                $opens ? ' at '.$opens->format('H:i') : '',
            ), 1, $href, $day->status === SiteDay::STATUS_MISSED);
        }

        foreach ($today->where('closer_id', $user->id)->where('status', SiteDay::STATUS_OPEN) as $day) {
            $closes = $day->site ? $this->sites->closesAt($day->site, now()) : null;
            if ($closes !== null && now()->lessThan($closes->subMinutes(30))) {
                continue;
            }
            $tasks[] = $this->task("close-site-{$day->stock_location_id}", 'site', 'You close today', sprintf(
                '%s closes%s. Count the till and hand the key to the next opener.',
                $day->site?->name ?? 'Your site',
                $closes ? ' at '.$closes->format('H:i') : '',
            ), 1, $href);
        }

        // Managers: sites not opened on time.
        $missed = $today->where('status', SiteDay::STATUS_MISSED)
            ->filter(fn (SiteDay $day): bool => $day->site !== null && (int) $day->opener_id !== (int) $user->id && $this->sites->canManage($user, $day->site));
        if ($missed->isNotEmpty()) {
            $tasks[] = $this->task('sites-not-open', 'warning', 'Not open on time', sprintf(
                '%s %s not open yet.',
                $missed->map(fn (SiteDay $day): string => $day->site->name)->join(', ', ' and '),
                $missed->count() === 1 ? 'is' : 'are',
            ), $missed->count(), $this->sitesUrl($user), true);
        }

        // Site keys I hold whose next opener is someone else.
        $held = CustodyKey::query()->with('keyable')->where('holder_id', $user->id)->where('keyable_type', StockLocation::class)->get();
        foreach ($held as $key) {
            $site = $key->keyable;
            if (! $site instanceof StockLocation || $key->pendingHandover() !== null) {
                continue;
            }

            $now = $today->firstWhere('stock_location_id', $site->id);
            $opensToday = $now !== null && in_array($now->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true);

            if ($now !== null && $now->status === SiteDay::STATUS_OPEN) {
                continue; // Open now: the key is needed at the site until closing.
            }

            // Whoever opens next: today, if it has not opened yet; else the next planned day.
            $next = $opensToday ? ($now->opener_id !== null ? $now->loadMissing('opener') : null) : $this->days->nextPlannedOpening($site, now());
            if ($opensToday && $now->opener_id === null) {
                continue; // Opens today with no opener named: the holder probably opens.
            }

            if ($next === null || $next->opener === null || (int) $next->opener_id === (int) $user->id) {
                continue;
            }

            $tasks[] = $this->task("pass-key-{$site->id}", 'key', 'Hand the key on', sprintf(
                '%s opens %s on %s. Hand them the %s.',
                $next->opener->first_name,
                $site->name,
                $next->date->format('D j M'),
                $key->label(),
            ), 1, $href);
        }

        return $tasks;
    }

    private function sitesUrl(User $user): ?string
    {
        $url = $this->workUrl($user);

        return $url === null ? null : rtrim($url, '/').'/sites';
    }

    /** The user's own app's work page (absolute, so it works from any app). */
    public function workUrl(User $user): ?string
    {
        $app = match (true) {
            $user->isRole('seller', 'store_manager') => 'seller',
            $user->isRole('stock_keeper') => 'stock_keeper',
            $user->isRole('delivery') => 'delivery',
            $user->isRole('admin', 'dev') => 'admin',
            default => null,
        };

        return $app !== null && Route::has("{$app}.work") ? route("{$app}.work") : null;
    }

    /** @return array{id: string, kind: string, title: string, detail: string, count: int, href: string|null, urgent: bool} */
    private function task(string $id, string $kind, string $title, string $detail, int $count, ?string $href, bool $urgent = false): array
    {
        return compact('id', 'kind', 'title', 'detail', 'count', 'href', 'urgent');
    }
}
