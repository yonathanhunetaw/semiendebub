<?php

namespace App\Http\Middleware;

use App\Models\Seller\Cart;
use App\Services\Admin\ActiveStore;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /** @var array<string, mixed>|null */
    private ?array $adminScope = null;

    /** @return array<string, mixed> */
    private function adminScope(): array
    {
        $activeStore = app(ActiveStore::class);

        return $this->adminScope ??= $activeStore->isResolved() ? $activeStore->toShared() : [];
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        // NOTE: The following code is commented out because it is not needed for a single-node MySQL setup. If you want to enable replication in the future, you can uncomment this code and set the appropriate logic to determine the database node.
        // $databaseNode = null;
        // try {
        //     $hostname = \Illuminate\Support\Facades\DB::select('SELECT @@hostname AS hostname')[0]->hostname ?? null;
        //     if ($hostname) {
        //         $lower = strtolower($hostname);
        //         $databaseNode = match (true) {
        //             str_contains($lower, 'ubuntu') => 'Ubuntu (Master)',
        //             str_contains($lower, 'mac') => 'Mac (Replica)',
        //             str_contains($lower, 'pi') || str_contains($lower, 'raspberry') => 'Raspberry Pi (Replica)',
        //             default => $hostname,
        //         };
        //     }
        // } catch (\Throwable $e) {
        //     $databaseNode = null;
        // }

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user() ? [
                    'id' => $request->user()->id,
                    'first_name' => $request->user()->first_name,
                    // The profile form edits exactly the fields
                    // ProfileUpdateRequest validates, so all of them have to be
                    // here or it opens with blanks and overwrites real values
                    // with empty ones.
                    'last_name' => $request->user()->last_name,
                    'phone_number' => $request->user()->phone_number,
                    'email' => $request->user()->email,
                    'email_verified_at' => $request->user()->email_verified_at,
                    'role' => $request->user()->role,
                    // Display accessor vs. comparable key: getRoleAttribute()
                    // returns "Stock Keeper", so the client can never match it
                    // against a stored value. Anything that branches on role
                    // (which chrome the profile page wears, for one) needs the
                    // key, and roleKey() is the same authority the route gates
                    // use.
                    'role_key' => $request->user()->roleKey(),
                    'store_id' => $request->user()->store_id,
                ] : null,
            ],
            // The seller bottom nav badges its Carts tab with the open carts.
            // Lazy, and null for every other role, so nobody else pays the query.
            'seller' => fn () => $request->user()?->roleKey() === 'seller'
                ? ['open_carts' => Cart::where('seller_id', $request->user()->id)->where('status', 'open')->count()]
                : null,
            // The admin app's store scope (sidebar dropdown, zones). Lazy:
            // share() runs before the route's ResolveActiveStore middleware,
            // so these are read at render time, and stay null off the admin app.
            'activeStore' => fn () => $this->adminScope()['activeStore'] ?? null,
            'accessibleStores' => fn () => $this->adminScope()['accessibleStores'] ?? [],
            'isGlobalAdmin' => fn () => $this->adminScope()['isGlobalAdmin'] ?? false,
            // Sidebar count badges, for admins only (a store manager on the
            // approvals screen sees none of those links).
            'adminNav' => fn () => app(ActiveStore::class)->isResolved() && $request->user()?->isRole('admin')
                ? ['counts' => app(\App\Services\Admin\AdminNavCounts::class)->counts()]
                : null,
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
            // NOTE: The following line is commented out because it is not needed for a single-node MySQL setup. If you want to enable replication in the future, you can uncomment this line and provide the appropriate logic to determine the database node.
            // 'databaseNode' => $databaseNode,
        ];
    }
}
