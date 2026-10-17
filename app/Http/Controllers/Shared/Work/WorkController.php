<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\ForceKeyRequest;
use App\Http\Requests\Workforce\HandOverKeyRequest;
use App\Http\Requests\Workforce\RejectKeyRequest;
use App\Models\Auth\User;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\Shift;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "My work": the keys I hold and the ones waiting for me, the sites I work
 * at and their hours today. Key steps go through KeyCustodyService.
 */
class WorkController extends Controller
{
    use ReadsWorkApp;

    public function __construct(
        private readonly KeyCustodyService $keys,
        private readonly Sites $sites,
        private readonly SiteDayService $days,
        private readonly RotaService $rota,
        private readonly AttendanceService $attendance,
    ) {
    }

    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('Work/Index', [
            'app' => $this->app($request),
            'keys' => $this->keys->heldBy($user)->map(fn (CustodyKey $key): array => $this->keys->present($key, $user) + [
                'receivers' => $this->keys->receivers($key, $user),
            ])->values()->all(),
            'waiting' => $this->keys->waitingFor($user)->map(fn (KeyHandover $handover): array => $this->keys->presentHandover($handover))->values()->all(),
            // Today at each site: who opens / closes, open or not.
            'days' => $this->days->todayFor($user)->all(),
            // My shifts for the next two weeks: accept, or ask for a change.
            'shifts' => $this->rota->upcomingFor($user)->map(fn (Shift $shift): array => $this->rota->present($shift))->values()->all(),
            // Where I am clocked in now, if anywhere.
            'clock' => ($entry = $this->attendance->openEntry($user)) ? $this->attendance->present($entry) : null,
            'managesSites' => $this->sites->managedBy($user)->isNotEmpty(),
            'reasons' => KeyHandover::REASONS,
        ]);
    }

    public function handOver(HandOverKeyRequest $request, CustodyKey $key): RedirectResponse
    {
        $to = User::query()->findOrFail((int) $request->validated('to_id'));

        return $this->attempt(
            fn () => $this->keys->handOver($key, $request->user(), $to, $request->validated('reason'), $request->validated('note')),
            sprintf('Handed to %s. It is yours until they accept it.', $to->first_name),
        );
    }

    public function accept(Request $request, KeyHandover $handover): RedirectResponse
    {
        return $this->attempt(fn () => $this->keys->accept($handover, $request->user()), 'You hold the key now.');
    }

    public function reject(RejectKeyRequest $request, KeyHandover $handover): RedirectResponse
    {
        return $this->attempt(fn () => $this->keys->reject($handover, $request->user(), $request->validated('note')), 'Noted: the key stays with the giver.');
    }

    public function cancel(Request $request, KeyHandover $handover): RedirectResponse
    {
        return $this->attempt(fn () => $this->keys->cancel($handover, $request->user()), 'Hand-over cancelled.');
    }

    public function force(ForceKeyRequest $request, CustodyKey $key): RedirectResponse
    {
        $to = User::query()->findOrFail((int) $request->validated('to_id'));

        return $this->attempt(
            fn () => $this->keys->force($key, $request->user(), $to, (string) $request->validated('note')),
            sprintf('%s holds the key now.', $to->first_name),
        );
    }
}
