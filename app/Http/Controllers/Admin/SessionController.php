<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\User;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class SessionController extends Controller
{
    /**
     * Display all active sessions.
     */
    /**
     * Display all active sessions.
     */
    public function index(): Response
    {
        $sessions = DB::table('sessions')
            ->orderByDesc('last_activity')
            ->get();

        /*
         * Load all users in one query instead of doing User::find()
         * for every session.
         */
        $userIds = $sessions
            ->pluck('user_id')
            ->filter()
            ->unique()
            ->values();

        $users = User::with('roles')
            ->whereIn('id', $userIds)
            ->get()
            ->keyBy('id');

        $sessionLifetime = (int) config('session.lifetime', 120);
        $rememberLifetime = 8640; // 6 days in minutes for remember-me sessions

        $mappedSessions = $sessions->map(function ($session) use (
            $users,
            $sessionLifetime,
            $rememberLifetime
        ) {
            $user = $session->user_id
                ? $users->get($session->user_id)
                : null;

            $lastActivity = Carbon::createFromTimestamp(
                (int) $session->last_activity
            );

            // Decode Laravel's session payload to check for remember state
            $payload = @unserialize(base64_decode($session->payload));
            $isRemembered = false;

            if (is_array($payload)) {
                foreach ($payload as $key => $value) {
                    if (str_starts_with($key, 'login_web_') && str_contains($key, '_remember_')) {
                        $isRemembered = true;
                        break;
                    }
                }
            }

            $effectiveLifetime = $session->custom_lifetime ?? ($isRemembered ? $rememberLifetime : $sessionLifetime);

            /*
             * Laravel DB sessions expire based on the effective lifetime
             * after the last activity.
             */
            $expiresAt = $lastActivity->copy()
                ->addMinutes($effectiveLifetime);

            /*
             * Consider a session "live" if it has been active recently.
             */
            $isLive = $lastActivity->greaterThanOrEqualTo(
                now()->subMinutes(2)
            );

            return [
                'id' => $session->id,

                'user' => $user
                    ? [
                        'id' => $user->id,
                        'first_name' => $user->first_name,
                        'last_name' => $user->last_name,
                        'email' => $user->email,
                        'role' => $user->roles->pluck('name')->first() ?? 'N/A',
                    ]
                    : [
                        'id' => null,
                        'first_name' => 'Guest',
                        'last_name' => '',
                        'email' => 'N/A',
                        'role' => 'Guest',
                    ],

                'ip_address' => $session->ip_address,

                'user_agent' => $session->user_agent,

                'last_activity' => $lastActivity->toISOString(),

                'expires_at' => $expiresAt->toISOString(),

                'last_active_human' => $lastActivity->diffForHumans(),

                'is_live' => $isLive,

                'is_current' => $session->id === session()->getId(),

                /*
                 * Pass the dynamic remember-me status to the frontend
                 */
                'remember_me' => $isRemembered,
            ];
        });

        return Inertia::render('Admin/Sessions/index', [
            'sessions' => $mappedSessions->values(),
        ]);
    }

    /**
     * Terminate a single session.
     */
    public function destroy(string $id): RedirectResponse
    {
        $currentSessionId = session()->getId();

        $session = DB::table('sessions')
            ->where('id', $id)
            ->first();

        if (!$session) {
            return back()->with('error', 'Session not found.');
        }

        DB::table('sessions')
            ->where('id', $id)
            ->delete();

        /*
         * If the administrator terminated their own session,
         * log them out and send them to login.
         */
        if ($currentSessionId === $id) {
            auth()->logout();

            request()->session()->invalidate();
            request()->session()->regenerateToken();

            return redirect()->route('login');
        }

        return back()->with(
            'message',
            'Session terminated successfully.'
        );
    }

    /**
     * Extend a session.
     *
     * Laravel's sessions use last_activity as an activity timestamp.
     * We should NOT put a future timestamp into last_activity.
     *
     * Refreshing last_activity effectively gives the session a fresh
     * session lifetime from the current moment.
     */
    public function extend(Request $request, string $id): RedirectResponse
    {
        $validated = $request->validate([
            'minutes' => ['required', 'integer', 'min:1'],
        ]);

        $session = DB::table('sessions')
            ->where('id', $id)
            ->first();

        if (!$session) {
            return back()->with('error', 'Session not found.');
        }

        DB::table('sessions')
            ->where('id', $id)
            ->update([
                'last_activity' => now()->timestamp,
                'custom_lifetime' => $validated['minutes'],
            ]);

        return back()->with(
            'message',
            'Session lifetime extended successfully.'
        );
    }

    /**
     * Extend all sessions.
     */
    public function extendAll(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'minutes' => ['required', 'integer', 'min:1'],
        ]);

        $updated = DB::table('sessions')->update([
            'last_activity' => now()->timestamp,
            'custom_lifetime' => $validated['minutes'],
        ]);

        return back()->with(
            'message',
            "{$updated} session(s) extended successfully."
        );
    }

    /**
     * Extend selected sessions.
     */
    public function extendSelected(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'string'],
            'minutes' => ['required', 'integer', 'min:1'],
        ]);

        $updated = DB::table('sessions')
            ->whereIn('id', $validated['ids'])
            ->update([
                'last_activity' => now()->timestamp,
                'custom_lifetime' => $validated['minutes'],
            ]);

        return back()->with(
            'message',
            "{$updated} session(s) extended successfully."
        );
    }

    /**
     * Terminate all sessions except the current administrator session.
     */
    public function destroyAll(): RedirectResponse
    {
        $currentSessionId = session()->getId();

        $deleted = DB::table('sessions')
            ->where('id', '!=', $currentSessionId)
            ->delete();

        return back()->with(
            'message',
            "{$deleted} other session(s) terminated successfully."
        );
    }

    /**
     * Terminate selected sessions.
     */
    public function destroySelected(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'string'],
        ]);

        $currentSessionId = session()->getId();

        /*
         * Never allow a bulk request to accidentally delete the
         * administrator's current session.
         */
        $ids = collect($validated['ids'])
            ->reject(fn ($id) => $id === $currentSessionId)
            ->values()
            ->all();

        if (empty($ids)) {
            return back()->with(
                'error',
                'Your current session cannot be terminated from a bulk action.'
            );
        }

        $deleted = DB::table('sessions')
            ->whereIn('id', $ids)
            ->delete();

        return back()->with(
            'message',
            "{$deleted} session(s) terminated successfully."
        );
    }
}