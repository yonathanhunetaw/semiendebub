<?php

namespace App\Http\Middleware;

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
                    'email' => $request->user()->email,
                    'role' => $request->user()->role,
                    'store_id' => $request->user()->store_id,
                ] : null,
            ],
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
            // NOTE: The following line is commented out because it is not needed for a single-node MySQL setup. If you want to enable replication in the future, you can uncomment this line and provide the appropriate logic to determine the database node.
            // 'databaseNode' => $databaseNode,
        ];
    }
}
