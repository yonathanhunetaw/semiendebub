<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work\Concerns;

use App\Exceptions\WorkforceException;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * The work pages are one set on admin, seller, stock keeper and delivery
 * (routes/web/partials/work.php). The app is the route name's prefix.
 */
trait ReadsWorkApp
{
    /** @var array<int, string> */
    private array $workApps = ['admin', 'seller', 'stock_keeper', 'delivery'];

    private function app(Request $request): string
    {
        $app = explode('.', (string) $request->route()?->getName())[0];
        abort_unless(in_array($app, $this->workApps, true), 404);

        return $app;
    }

    /**
     * Run a service step; a WorkforceException becomes a flash error (or a
     * 403). The success message may be worked out from the step's result.
     *
     * @param  string|Closure(mixed): string  $success
     */
    private function attempt(Closure $step, string|Closure $success): RedirectResponse
    {
        try {
            $result = $step();
        } catch (WorkforceException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());
            abort_if($e->getCode() === 404, 404, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $success instanceof Closure ? $success($result) : $success);
    }
}
