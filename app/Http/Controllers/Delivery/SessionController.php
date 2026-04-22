<?php
namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Jenssegers\Agent\Agent; // Optional: helps parse browser/device info
use Illuminate\Support\Carbon;
class SessionController extends Controller
{
    // app/Http/Controllers/Delivery/SessionController.php

    public function index(Request $request)
    {
        $sessions = DB::table('sessions')
            ->where('user_id', $request->user()->id)
            ->orderBy('last_activity', 'desc')
            ->get()
            ->map(function ($session) {
                return [
                    'id' => $session->id,
                    'ip_address' => $session->ip_address,
                    'is_current_device' => $session->id === request()->session()->getId(),
                    'last_active' => \Carbon\Carbon::createFromTimestamp($session->last_activity)->diffForHumans(),
                    // Hardcoded fallback since we aren't using Agent
                    'agent' => [
                        'is_desktop' => true,
                        'platform' => 'Unknown Device',
                        'browser' => 'Web Browser',
                    ],
                ];
            });

        return inertia('Delivery/Sessions/Index', [
            'sessions' => $sessions,
        ]);
    }

    protected function getSessions(Request $request)
    {
        return collect(DB::connection(config('session.connection'))->table(config('session.table', 'sessions'))
            ->where('user_id', $request->user()->getAuthIdentifier())
            ->orderBy('last_activity', 'desc')
            ->get())->map(function ($session) use ($request) {
                $agent = $this->createAgent($session);

                return [
                    'id' => $session->id,
                    'ip_address' => $session->ip_address,
                    'is_current_device' => $session->id === $request->session()->getId(),
                    'agent' => [
                        'is_desktop' => $agent->isDesktop(),
                        'platform' => $agent->platform(),
                        'browser' => $agent->browser(),
                    ],
                    'last_active' => Carbon::createFromTimestamp($session->last_activity)->diffForHumans(),
                ];
            });
    }

    protected function createAgent($session)
    {
        return tap(new Agent, fn($agent) => $agent->setUserAgent($session->user_agent));
    }

    public function destroy($id)
    {
        DB::connection(config('session.connection'))->table(config('session.table', 'sessions'))
            ->where('id', $id)
            ->where('user_id', auth()->id())
            ->delete();

        return back();
    }
}
