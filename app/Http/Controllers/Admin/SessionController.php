<?php
namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class SessionController extends Controller
{
    public function index()
    {
        $sessions = DB::table('sessions')->orderBy('last_activity', 'desc')->get();

        $mappedSessions = $sessions->map(function ($session) {
            $user = $session->user_id ? User::find($session->user_id) : null;
            $payload = @unserialize(base64_decode($session->payload)) ?: [];
            $rememberMe = $payload['remember_me'] ?? false;

            $lastActivity = (int) $session->last_activity;
            $sessionLifetime = (int) config('session.lifetime');
            
            $expiresAt = now()->createFromTimestamp($lastActivity)
                ->setTimezone(config('app.timezone'))
                ->addMinutes($rememberMe ? 4320 : $sessionLifetime); // 4320 = 3 days

            return [
                'id' => $session->id,
                'user' => $user ? ['name' => $user->name, 'email' => $user->email] : null,
                'ip_address' => $session->ip_address,
                'user_agent' => $session->user_agent, // Useful for the UI
                'remember_me' => $rememberMe,
                'expires_at' => $expiresAt->toDateTimeString(),
                'is_current' => $session->id === session()->getId(),
            ];
        });

        return Inertia::render('Admin/Sessions/Index', [
            'sessions' => $mappedSessions
        ]);
    }

    public function destroy($id)
    {
        DB::table('sessions')->where('id', $id)->delete();

        if (session()->getId() === $id) {
            auth()->logout();
            session()->invalidate();
            session()->regenerateToken();
            return redirect()->route('login');
        }

        return back()->with('success', 'Session deleted successfully.');
    }
}