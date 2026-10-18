<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\ClockRequest;
use App\Http\Requests\Workforce\CloseSiteRequest;
use App\Http\Requests\Workforce\OpenSiteRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\TimeEntry;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * At the counter. The QR's URL lands here (through the root domain's relay):
 * open or close the site, and clock in or out. Every step re-checks the code,
 * so the page cannot be kept open at home and used later.
 *
 * The counter screen shows the live code for everyone else, once the site is
 * open, to its managers and to whoever opened it.
 */
class ClockController extends Controller
{
    use ReadsWorkApp;

    public function __construct(
        private readonly Sites $sites,
        private readonly SiteDayService $days,
        private readonly CounterQr $qr,
        private readonly KeyCustodyService $keys,
        private readonly AttendanceService $attendance,
    ) {
    }

    public function show(Request $request, StockLocation $site, string $token): Response
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($this->sites->isSite($site), 404);
        $kind = $this->qr->verify($site, $token);
        $works = $this->sites->worksAt($user, $site);
        $day = $this->days->day($site, now());

        return Inertia::render('Work/Clock', [
            'app' => $this->app($request),
            'token' => $token,
            'code' => $kind,
            'works_here' => $works,
            'day' => $works ? $this->days->present($site, $day, $user) : null,
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind_label' => $site->kind_label],
            'key_receivers' => $works ? $this->keys->receivers($this->keys->keyFor($site), $user) : [],
            'next_opener' => $this->days->nextPlannedOpening($site, now())?->opener?->only(['id', 'first_name', 'last_name']),
            'has_shifts' => $this->sites->hasShifts($site),
            // Where I am clocked in now (here or elsewhere), and who else is in.
            'my_entry' => ($mine = $this->attendance->openEntry($user)) ? $this->attendance->present($mine) : null,
            'still_in' => $works ? $this->attendance->stillIn($site, $user)
                ->map(fn (TimeEntry $entry): array => $this->attendance->present($entry))->values()->all() : [],
        ]);
    }

    public function clockIn(ClockRequest $request, StockLocation $site): RedirectResponse
    {
        abort_unless($this->sites->isSite($site), 404);
        $token = (string) $request->validated('token');

        return $this->attempt(
            fn () => $this->attendance->clockIn($request->user(), $site, $token),
            fn (TimeEntry $entry): string => sprintf('Clocked in at %s.', LocalTime::wall($entry->clock_in_at, 'H:i')),
        );
    }

    public function clockOut(ClockRequest $request, StockLocation $site): RedirectResponse
    {
        abort_unless($this->sites->isSite($site), 404);
        $token = (string) $request->validated('token');

        return $this->attempt(
            fn () => $this->attendance->clockOut($request->user(), $site, $token),
            fn (TimeEntry $entry): string => sprintf('Clocked out at %s.', LocalTime::wall($entry->clock_out_at, 'H:i')),
        );
    }

    public function open(OpenSiteRequest $request, StockLocation $site): RedirectResponse
    {
        abort_unless($this->sites->isSite($site), 404);

        return $this->attempt(fn () => $this->days->open(
            $site,
            $request->user(),
            $request->validated('token'),
            $request->validated('ticked') ?? [],
            $request->validated('float_amount') !== null ? (float) $request->validated('float_amount') : null,
            $request->validated('note'),
        ), sprintf('%s is open.', $site->name));
    }

    public function close(CloseSiteRequest $request, StockLocation $site): RedirectResponse
    {
        abort_unless($this->sites->isSite($site), 404);
        $keyTo = $request->validated('key_to_id') ? User::query()->find((int) $request->validated('key_to_id')) : null;

        return $this->attempt(fn () => $this->days->close(
            $site,
            $request->user(),
            $request->validated('token'),
            $request->validated('ticked') ?? [],
            $request->validated('till_count') !== null ? (float) $request->validated('till_count') : null,
            $request->validated('note'),
            $keyTo,
            (bool) $request->validated('clock_out_others'),
        ), $keyTo ? sprintf('%s is closed. The key waits for %s to accept it.', $site->name, $keyTo->first_name) : sprintf('%s is closed.', $site->name));
    }

    /** The counter screen: the live QR, refreshed every minute. */
    public function counter(Request $request, StockLocation $site): Response
    {
        $this->authorizeCounter($request->user(), $site);

        return Inertia::render('Work/Counter', [
            'app' => $this->app($request),
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind_label' => $site->kind_label],
            'code' => $this->liveCode($site),
        ]);
    }

    /** The live code as JSON, for the counter screen's refresh. */
    public function code(Request $request, StockLocation $site): JsonResponse
    {
        $this->authorizeCounter($request->user(), $site);

        return response()->json($this->liveCode($site));
    }

    /** @return array{url: string, seconds_left: int, open: bool} */
    private function liveCode(StockLocation $site): array
    {
        $open = $this->days->day($site, now())->status === SiteDay::STATUS_OPEN;

        return [
            'url' => $this->qr->url($site, $this->qr->liveToken($site)),
            'seconds_left' => $this->qr->secondsLeft(),
            'open' => $open,
        ];
    }

    private function authorizeCounter(?User $user, StockLocation $site): void
    {
        abort_unless($this->sites->isSite($site), 404);

        if ($this->sites->canManage($user, $site)) {
            return;
        }

        $day = $this->days->day($site, now());
        $here = $user !== null && (int) ($this->attendance->openEntry($user)?->stock_location_id ?? 0) === (int) $site->id;

        abort_unless(
            $user !== null && $day->status === SiteDay::STATUS_OPEN && ((int) $day->opened_by === (int) $user->id || $here),
            403,
            'The counter screen is for whoever is at work at the site, or its managers.',
        );
    }
}
