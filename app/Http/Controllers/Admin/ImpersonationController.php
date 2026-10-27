<?php

namespace App\Http\Controllers\Admin;

use App\Models\Auth\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * The Apps menu (the Role Switcher): an admin moves between apps without typing a password.
 *
 * Sessions are per host (SESSION_DOMAIN is null), so the target app has no idea
 * who the admin is. The current host hands over a one-time, 60-second token
 * (start); the target host spends it to sign the right person in (enter) and
 * remembers which admin asked. Two kinds of move:
 *
 *   - as yourself: your own account in another app you hold a role for;
 *   - as someone else ("Open as"): only a global admin, never an admin or dev.
 *
 * The authority is always the real admin (the session's `impersonator` when
 * there is one, else the signed-in user), so you can switch again from inside
 * an opened app without going back first. Every step runs as a real user, so
 * rules like the two-person payment check still hold.
 */
class ImpersonationController extends Controller
{
    private const TOKEN_TTL_SECONDS = 60;

    /** Roles nobody may be opened as. */
    private const NEVER = ['admin', 'dev'];

    /** What the switcher can open: the apps for the admin themself, and (global admins) other people. */
    public function users(Request $request): JsonResponse
    {
        $actor = $this->actor($request);

        $people = $this->isGlobal($actor)
            ? User::query()->visibleTo($actor)->with('roles')->whereKeyNot($actor->id)->orderBy('first_name')->get()
                ->filter(fn (User $user): bool => $this->mayOpen($user))
                ->map(fn (User $user): array => [
                    'id' => $user->id,
                    'name' => trim($user->first_name.' '.$user->last_name),
                    'role_key' => $this->appRole($user),
                ])->values()
            : collect();

        return response()->json([
            'me' => trim($actor->first_name.' '.$actor->last_name),
            'mine' => $this->ownApps($actor),
            'people' => $people,
        ]);
    }

    /** Current host: issue a token and send the browser to the target app. */
    public function start(Request $request): Response
    {
        $actor = $this->actor($request);
        $data = $request->validate(['user_id' => 'nullable|integer', 'role' => 'nullable|string']);

        if (isset($data['user_id']) && (int) $data['user_id'] !== $actor->id) {
            // Open as someone else.
            $target = User::with('roles')->findOrFail($data['user_id']);
            abort_unless($this->isGlobal($actor) && $this->mayOpen($target) && ! $target->isHiddenFrom($actor), 403, 'You cannot open this account.');
            $role = $this->appRole($target);
        } else {
            // Your own account in another app.
            $target = $actor;
            $role = (string) ($data['role'] ?? '');
            abort_unless(in_array($role, $this->ownApps($actor), true), 403, 'You do not hold that role.');
        }

        $host = $this->hostForRole($role);
        abort_if($host === null, 422, 'This role has no app to open.');

        $token = Str::random(48);
        Cache::put($this->cacheKey($token), [
            'user_id' => $target->id,
            'admin_id' => $actor->id,
            'host' => $host,
        ], self::TOKEN_TTL_SECONDS);

        Log::info('Role switch started', ['admin_id' => $actor->id, 'user_id' => $target->id, 'host' => $host]);

        return Inertia::location($this->urlFor($request, $host, "/impersonate/{$token}"));
    }

    /** Target host: spend the token and sign the chosen user in. */
    public function enter(Request $request, string $token): RedirectResponse
    {
        $grant = Cache::pull($this->cacheKey($token));

        abort_unless(is_array($grant) && $grant['host'] === $request->getHost(), 403, 'This link has expired.');

        $target = User::findOrFail($grant['user_id']);
        $admin = User::findOrFail($grant['admin_id']);

        Auth::guard('web')->login($target);
        $request->session()->regenerate();
        $request->session()->put('impersonator', [
            'id' => $admin->id,
            'name' => trim($admin->first_name.' '.$admin->last_name),
            // Your own account in another app, as opposed to someone else's.
            'self' => $admin->is($target),
        ]);

        return redirect()->to('/dashboard');
    }

    /** Target host: drop this session and go back to the admin app. */
    public function stop(Request $request): Response
    {
        $impersonator = $request->session()->get('impersonator');

        // Only a session that was opened here may be closed this way.
        abort_if($impersonator === null, 403);

        Log::info('Role switch stopped', ['admin_id' => $impersonator['id'], 'user_id' => $request->user()?->id]);

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        $adminHost = $this->hostForRole('admin') ?? $request->getHost();

        return Inertia::location($this->urlFor($request, $adminHost, '/dashboard'));
    }

    /** The real admin behind this request: the one who opened this session, or the signed-in user. */
    private function actor(Request $request): User
    {
        $impersonatorId = $request->session()->get('impersonator.id');
        $actor = $impersonatorId ? User::with('roles')->find($impersonatorId) : $request->user()?->loadMissing('roles');

        abort_unless($actor instanceof User && $actor->hasRole('admin'), 403, 'Only an admin can switch roles.');

        return $actor;
    }

    /** An admin with no store sees and opens everything. */
    private function isGlobal(User $actor): bool
    {
        return $actor->store_id === null;
    }

    /**
     * The apps the admin may open as themself: every app for a global admin,
     * the roles they are ticked for (plus the admin app) for a store admin.
     *
     * @return array<int, string> role keys
     */
    private function ownApps(User $actor): array
    {
        if ($this->isGlobal($actor)) {
            return array_values(array_unique(array_values(config('subdomains.host_role_map', []))));
        }

        return $actor->roles->pluck('name')
            ->map(fn (string $name): string => $name === 'store_manager' ? 'seller' : $name)
            ->filter(fn (string $role): bool => $role !== 'dev' && $this->hostForRole($role) !== null)
            ->unique()->values()->all();
    }

    private function mayOpen(User $user): bool
    {
        return ! $user->hasAnyRole(self::NEVER) && $this->hostForRole($this->appRole($user)) !== null;
    }

    /** The app a user works in: a store manager works in the seller app. */
    private function appRole(User $user): string
    {
        $role = $user->roleKey();

        return $role === 'store_manager' ? 'seller' : $role;
    }

    private function hostForRole(string $role): ?string
    {
        foreach (config('subdomains.host_role_map', []) as $host => $mapped) {
            if ($mapped === $role) {
                return $host;
            }
        }

        return null;
    }

    private function urlFor(Request $request, string $host, string $path): string
    {
        $port = $request->getPort();
        $portSuffix = ($port && ! in_array($port, [80, 443])) ? ":{$port}" : '';

        return ($request->isSecure() ? 'https://' : 'http://').$host.$portSuffix.$path;
    }

    private function cacheKey(string $token): string
    {
        return 'impersonate:'.hash('sha256', $token);
    }
}
