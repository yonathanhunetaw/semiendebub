<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The root domain's /clock/{site}/{token}: what the counter QR opens. Staff
 * sign in to different apps, so this page links to each app's clock page
 * (and jumps straight there once the phone has picked one). It checks
 * nothing itself; the app page does.
 */
class ClockRelayController extends Controller
{
    public function __invoke(Request $request, int $site, string $token): Response
    {
        $apps = [
            'seller' => 'Seller app',
            'stock_keeper' => 'Stock keeper app',
            'admin' => 'Admin app',
        ];

        return Inertia::render('Work/ClockRelay', [
            'apps' => collect($apps)->map(fn (string $label, string $app): array => [
                'app' => $app,
                'label' => $label,
                'url' => route("{$app}.work.clock", ['site' => $site, 'token' => $token]),
            ])->values()->all(),
        ]);
    }
}
