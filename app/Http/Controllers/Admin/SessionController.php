<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\User;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Carbon\Carbon;

class SessionController extends Controller
{
    public function index()
    {
        $sessions = DB::table('sessions')->orderBy('last_activity', 'desc')->get();

        $mappedSessions = $sessions->map(function ($session) {
            $user = $session->user_id ? User::find($session->user_id) : null;

            // Decode payload for remember_me status
            $payload = @unserialize(base64_decode($session->payload)) ?: [];
            $rememberMe = $payload['remember_me'] ?? false;

            $lastActivity = (int) $session->last_activity;
            $sessionLifetime = (int) config('session.lifetime');

            $expiresAt = Carbon::createFromTimestamp($lastActivity)
                ->addMinutes($rememberMe ? 43200 : $sessionLifetime);

            return [
                'id' => $session->id,
                'user' => $user ? [
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'email' => $user->email,
                    'role' => $user->roles->pluck('name')->first() ?? 'N/A',
                ] : [
                    'first_name' => 'Guest',
                    'last_name' => '',
                    'email' => 'N/A',
                    'role' => 'Guest',
                ],
                'ip_address' => $session->ip_address,
                'user_agent' => $session->user_agent,
                'expires_at' => $expiresAt->toDateTimeString(),
                'last_active_human' => Carbon::createFromTimestamp($lastActivity)->diffForHumans(),
                'is_live' => $lastActivity >= now()->subMinutes(2)->timestamp,
                'is_current' => $session->id === session()->getId(),
                'remember_me' => $rememberMe, // Passed to frontend
            ];
        });

        return Inertia::render('Admin/Sessions/Index', [
            'sessions' => $mappedSessions,
        ]);
    }

    public function destroy($id)
    {
        DB::table('sessions')->where('id', $id)->delete();

        if (session()->getId() === $id) {
            auth()->logout();
            session()->invalidate();
            session()->regenerateToken();
            return redirect('/login');
        }

        return back()->with('message', 'Session terminated successfully.');
    }
}
