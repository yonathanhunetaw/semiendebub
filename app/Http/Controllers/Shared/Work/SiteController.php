<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\PlanSiteDaysRequest;
use App\Http\Requests\Workforce\SaveSiteExceptionRequest;
use App\Http\Requests\Workforce\SaveSiteHoursRequest;
use App\Http\Requests\Workforce\SaveSiteSettingsRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteHourException;
use App\Exceptions\WorkforceException;
use App\Services\Admin\ActiveStore;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Site setup for its managers: opening hours, closed days, the key and its
 * log, who works there. On admin, a store admin sees their store's sites;
 * a global admin the active store's sites plus the Main Hubs.
 */
class SiteController extends Controller
{
    use ReadsWorkApp;

    public function __construct(
        private readonly Sites $sites,
        private readonly SiteDayService $days,
        private readonly CounterQr $qr,
    ) {
    }

    public function index(Request $request): Response
    {
        $today = now();

        return Inertia::render('Work/Sites/Index', [
            'app' => $this->app($request),
            'sites' => $this->visible($request)->map(fn (StockLocation $site): array => [
                'id' => (int) $site->id,
                'name' => $site->name,
                'kind' => $site->kind,
                'kind_label' => $site->kind_label,
                'has_shifts' => $this->sites->hasShifts($site),
                'today' => $this->sites->hoursOn($site, $today),
            ])->values()->all(),
        ]);
    }

    public function show(Request $request, StockLocation $site): Response
    {
        /** @var User $user */
        $user = $request->user();
        $this->authorizeSite($user, $site);

        return Inertia::render('Work/Sites/Show', [
            'app' => $this->app($request),
            'site' => [
                'id' => (int) $site->id,
                'name' => $site->name,
                'kind' => $site->kind,
                'kind_label' => $site->kind_label,
                'address' => $site->address,
                'has_shifts' => $this->sites->hasShifts($site),
            ],
            'week' => $this->sites->week($site),
            'exceptions' => SiteHourException::query()
                ->where('stock_location_id', $site->id)
                ->whereDate('date', '>=', LocalTime::today()->subDays(7)->toDateString())
                ->orderBy('date')
                ->get()
                ->map(fn (SiteHourException $exception): array => [
                    'id' => (int) $exception->id,
                    'date' => $exception->date->toDateString(),
                    'closed' => (bool) $exception->closed,
                    'opens_at' => $exception->opens_at ? substr((string) $exception->opens_at, 0, 5) : null,
                    'closes_at' => $exception->closes_at ? substr((string) $exception->closes_at, 0, 5) : null,
                    'note' => $exception->note,
                ])->all(),
            'today' => $this->days->present($site, $this->days->current($site), $user),
            'settings' => [
                'open_grace_minutes' => (int) ($settings = $this->qr->settings($site))->open_grace_minutes,
                'opening_checklist' => $settings->openingItems(),
                'closing_checklist' => $settings->closingItems(),
            ],
            'people' => $this->sites->people($site)->map(fn (User $person): array => [
                'id' => (int) $person->id,
                'name' => trim($person->first_name.' '.$person->last_name),
                'role' => $person->role,
            ])->values()->all(),
        ]);
    }

    public function saveHours(SaveSiteHoursRequest $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);
        $this->sites->saveWeek($site, $request->validated('days'));

        return back()->with('success', 'Opening hours saved.');
    }

    public function plan(PlanSiteDaysRequest $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);

        try {
            foreach ($request->validated('days') as $day) {
                $this->days->plan(
                    $site,
                    LocalTime::day($day['date']),
                    $request->user(),
                    isset($day['opener_id']) ? (int) $day['opener_id'] : null,
                    isset($day['closer_id']) ? (int) $day['closer_id'] : null,
                    isset($day['driver_id']) ? (int) $day['driver_id'] : null,
                );
            }
        } catch (WorkforceException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Who opens, closes and drives: saved.');
    }

    public function saveSettings(SaveSiteSettingsRequest $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);
        $clean = fn (?array $items): array => array_values(array_filter(array_map('trim', $items ?? []), fn (string $item): bool => $item !== ''));

        $this->qr->settings($site)->update([
            'open_grace_minutes' => (int) $request->validated('open_grace_minutes'),
            'opening_checklist' => $clean($request->validated('opening_checklist')),
            'closing_checklist' => $clean($request->validated('closing_checklist')),
        ]);

        return back()->with('success', 'Checklists saved.');
    }

    /** The QR to print and stick at the counter (valid for opening only). */
    public function printedQr(Request $request, StockLocation $site): Response
    {
        $this->authorizeSite($request->user(), $site);

        return Inertia::render('Work/PrintedQr', [
            'app' => $this->app($request),
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind_label' => $site->kind_label],
            'url' => $this->qr->url($site, $this->qr->printedToken($site)),
            'version' => (int) $this->qr->settings($site)->qr_version,
        ]);
    }

    /** Void the printed QR: the old paper stops working. */
    public function reprint(Request $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);
        $this->qr->reprint($site);

        return back()->with('success', 'New QR made. Print it; the old one no longer works.');
    }

    public function storeException(SaveSiteExceptionRequest $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);
        $closed = (bool) $request->validated('closed');

        SiteHourException::query()->updateOrCreate(
            ['stock_location_id' => $site->id, 'date' => $request->validated('date')],
            [
                'closed' => $closed,
                'opens_at' => $closed ? null : $request->validated('opens_at'),
                'closes_at' => $closed ? null : $request->validated('closes_at'),
                'note' => $request->validated('note'),
                'created_by' => $request->user()->id,
            ],
        );

        return back()->with('success', 'Saved for that date.');
    }

    public function destroyException(Request $request, StockLocation $site, SiteHourException $exception): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);
        abort_unless((int) $exception->stock_location_id === (int) $site->id, 404);
        $exception->delete();

        return back()->with('success', 'Back to the usual hours on that date.');
    }

    /** @return Collection<int, StockLocation> */
    private function visible(Request $request): Collection
    {
        $sites = $this->sites->managedBy($request->user());

        if ($this->app($request) === 'admin') {
            $active = app(ActiveStore::class)->id();
            if ($active !== null) {
                $sites = $sites->filter(fn (StockLocation $site): bool => $site->store_id === null || (int) $site->store_id === $active);
            }
        }

        return $sites->values()->toBase();
    }

    private function authorizeSite(?User $user, StockLocation $site): void
    {
        abort_unless($this->sites->isSite($site), 404);
        abort_unless($this->sites->canManage($user, $site), 403, 'You do not manage this site.');
    }
}
