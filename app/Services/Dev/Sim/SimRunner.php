<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Plays script events (SimDayScript) through SimActions.
 *
 * Back-dated: the app's clock is set to each event's time, so every now(),
 * LocalTime and Eloquent timestamp is that moment. Live: the clock is the
 * real one and the runner sleeps between events (speed 60 = a shop hour per
 * minute).
 *
 * Each event runs in its own transaction as its person (Auth::setUser), so a
 * refused step leaves nothing half-done. Its refusal is reported, and every
 * later event waiting on it is skipped.
 */
final class SimRunner
{
    /** @var array<string, true> refs whose step was refused */
    private array $failed = [];

    public function __construct(private readonly SimCast $cast, private readonly SimActions $actions, private readonly SimReport $report)
    {
    }

    /**
     * @param  array<int, array<string, mixed>>  $events
     * @param  (callable(string): void)|null  $log
     */
    public function run(array $events, bool $live = false, float $speed = 60.0, ?callable $log = null): void
    {
        $started = microtime(true);
        // The clock as it was (a test may have set it), put back afterwards.
        $before = Carbon::getTestNow();
        $first = $events === [] ? null : CarbonImmutable::parse($events[0]['at']);

        foreach ($events as $event) {
            $at = CarbonImmutable::parse($event['at']);

            if ($live) {
                $due = $started + $first->diffInSeconds($at) / max(0.01, $speed);
                if (($wait = $due - microtime(true)) > 0) {
                    usleep((int) ($wait * 1_000_000));
                }
            } else {
                Carbon::setTestNow($at);
                CarbonImmutable::setTestNow($at);
            }

            $this->play($event, $log);
        }

        if (! $live) {
            Carbon::setTestNow($before);
            CarbonImmutable::setTestNow($before === null ? null : CarbonImmutable::instance($before));
        }
    }

    /** @param (callable(string): void)|null $log */
    private function play(array $event, ?callable $log): void
    {
        $ref = $event['ref'];
        $who = $this->cast->person($event['as']);
        $when = \App\Services\Workforce\LocalTime::wall(now(), 'D d M H:i');
        $name = trim($who->first_name.' '.$who->last_name);

        foreach ($event['needs'] as $need) {
            if (isset($this->failed[$need])) {
                $this->report->ok('skipped: waited on a refused step');
                if ($ref !== null) {
                    $this->failed[$ref] = true;
                }

                return;
            }
        }

        Auth::setUser($who);

        try {
            $done = DB::transaction(fn (): ?string => $this->actions->run($event, $who));
            $this->report->ok($event['kind']);

            if ($this->actions->expected !== null) {
                $this->report->expected($when, $name, $event['kind'], $this->actions->expected);
            }

            if ($log !== null && $done !== null) {
                $log("{$when}  {$name}: {$done}");
            }
        } catch (SimExpected $e) {
            $this->report->expected($when, $name, $event['kind'], $e->getMessage());
            if ($ref !== null) {
                $this->failed[$ref] = true;
            }
        } catch (Throwable $e) {
            $this->report->refused($when, $name, $event['kind'], $e);
            if ($ref !== null) {
                $this->failed[$ref] = true;
            }
            if ($log !== null) {
                $log("{$when}  {$name}: REFUSED {$event['kind']}: {$e->getMessage()}");
            }
        } finally {
            Auth::forgetUser();
        }
    }
}
