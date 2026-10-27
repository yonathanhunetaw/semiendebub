<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The stock keeping routes exist twice: `stock_keeper.*` on the stockkeeper app
 * and `seller.stock.*` inside the seller app (routes/web/partials/stock-keeping.php).
 * A controller that redirects or links to a sibling screen asks here, so it
 * stays in the app the person is working in.
 */
final class StockKeepingRoutes
{
    public const SELLER_PREFIX = 'seller.stock.';

    /** The route name of a `stock_keeper.*` screen, in the app of the current request. */
    public static function name(string $name): string
    {
        $current = request()->route()?->getName();

        if (is_string($current) && str_starts_with($current, self::SELLER_PREFIX) && str_starts_with($name, 'stock_keeper.')) {
            return self::SELLER_PREFIX.substr($name, strlen('stock_keeper.'));
        }

        return $name;
    }

    /**
     * @param  array<string, mixed>|int|string|object  $parameters
     */
    public static function url(string $name, mixed $parameters = []): string
    {
        return route(self::name($name), $parameters);
    }
}
