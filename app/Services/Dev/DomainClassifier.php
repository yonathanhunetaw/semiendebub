<?php

declare(strict_types=1);

namespace App\Services\Dev;

use Illuminate\Support\Str;

/**
 * Resolves any code asset (route host, route name, URI, PHP namespace, TSX page path)
 * down to one of the canonical Duka business domains.
 */
final class DomainClassifier
{
    /**
     * Canonical domain keys, in the order they should be presented in the UI.
     *
     * @var list<string>
     */
    public const DOMAINS = [
        'admin',
        'seller',
        'stockkeeper',
        'delivery',
        'procurement',
        'finance',
        'marketing',
        'vendor',
        'user',
        'shared',
        'dev',
    ];

    public const FALLBACK = 'shared';

    /**
     * Human labels + accent colours consumed by the visualizer.
     *
     * @var array<string, array{label: string, color: string, description: string}>
     */
    public const META = [
        'admin' => ['label' => 'Admin', 'color' => '#6366f1', 'description' => 'Back-office control plane: catalog, stores, users, inventory.'],
        'seller' => ['label' => 'Seller', 'color' => '#f59e0b', 'description' => 'Storefront operators: carts, orders, shipments, pricing.'],
        'stockkeeper' => ['label' => 'Stockkeeper', 'color' => '#10b981', 'description' => 'Warehouse floor: stock counts, transfers, put-away.'],
        'delivery' => ['label' => 'Delivery', 'color' => '#06b6d4', 'description' => 'Freight & last-mile: shipment driving and hand-offs.'],
        'procurement' => ['label' => 'Procurement', 'color' => '#8b5cf6', 'description' => 'Purchase orders and supplier intake.'],
        'finance' => ['label' => 'Finance', 'color' => '#22c55e', 'description' => 'Sales ledger, payments and reporting.'],
        'marketing' => ['label' => 'Marketing', 'color' => '#ec4899', 'description' => 'Campaigns, public content and acquisition.'],
        'vendor' => ['label' => 'Vendor', 'color' => '#eab308', 'description' => 'External supplier portal.'],
        'user' => ['label' => 'User', 'color' => '#38bdf8', 'description' => 'Normal end-users: storefront shopping and visitor flows.'],
        'shared' => ['label' => 'Shared', 'color' => '#94a3b8', 'description' => 'Cross-cutting: auth, profile, errors, framework plumbing.'],
        'dev' => ['label' => 'Dev', 'color' => '#f43f5e', 'description' => 'Internal engineering tooling, lessons and this visualizer.'],
    ];

    /**
     * Aliases seen in hosts, route names, namespaces and page folders.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'stock_keeper' => 'stockkeeper',
        'stock-keeper' => 'stockkeeper',
        'stockkeepers' => 'stockkeeper',
        'warehouse' => 'stockkeeper',
        'storefront' => 'user',
        'shop' => 'user',
        'visitor' => 'user',
        'guest' => 'user',
        'customer' => 'user',
        'users' => 'user',
        'fulfillment' => 'delivery',
        'freight' => 'delivery',
        'auth' => 'shared',
        'password' => 'shared',
        'verification' => 'shared',
        'profile' => 'shared',
        'errors' => 'shared',
        'error' => 'shared',
        'sanctum' => 'shared',
        'debugbar' => 'shared',
        'glitchtip' => 'shared',
        'storage' => 'shared',
        'session' => 'shared',
        'sessions' => 'admin',
        'lesson4' => 'dev',
        'lesson6' => 'dev',
        'lessons' => 'dev',
        'inventory' => 'admin',
        'store' => 'admin',
        'store-variant' => 'admin',
        'store-transfer' => 'admin',
        'store-price-override' => 'admin',
        'cart' => 'admin',
        'item' => 'admin',
        'canvas' => 'admin',
        'sale' => 'finance',
        'payment' => 'finance',
        'purchase' => 'procurement',
    ];

    /**
     * Resolve the first candidate that maps onto a canonical domain.
     *
     * @param  list<string|null>  $candidates
     */
    public function resolve(array $candidates, string $fallback = self::FALLBACK): string
    {
        foreach ($candidates as $candidate) {
            if ($candidate === null || $candidate === '') {
                continue;
            }

            $domain = $this->normalize($candidate);

            if ($domain !== null) {
                return $domain;
            }
        }

        return $fallback;
    }

    /**
     * Normalize a single token ("StockKeeper", "stock_keeper", "seller.duka.test") to a domain key.
     */
    public function normalize(string $token): ?string
    {
        $token = strtolower(trim($token));

        if ($token === '') {
            return null;
        }

        // Hosts: seller.duka.test -> seller
        if (str_contains($token, '.') && ! str_contains($token, '/')) {
            $token = Str::before($token, '.');
        }

        $token = trim($token, '/ ');

        if (in_array($token, self::DOMAINS, true)) {
            return $token;
        }

        if (isset(self::ALIASES[$token])) {
            return self::ALIASES[$token];
        }

        $snake = str_replace('-', '_', $token);

        if (isset(self::ALIASES[$snake])) {
            return self::ALIASES[$snake];
        }

        $squashed = str_replace(['-', '_'], '', $token);

        return in_array($squashed, self::DOMAINS, true) ? $squashed : null;
    }

    /**
     * Derive the domain of a PHP class from its namespace segments.
     */
    public function fromNamespace(string $class): ?string
    {
        $segments = explode('\\', trim($class, '\\'));

        // Drop the App\Http\Controllers / App\Models / App\Services prefix noise.
        foreach ($segments as $segment) {
            if (in_array($segment, ['App', 'Http', 'Controllers', 'Models', 'Services', 'Requests', 'Middleware'], true)) {
                continue;
            }

            $domain = $this->normalize($segment);

            if ($domain !== null) {
                return $domain;
            }
        }

        return null;
    }

    /**
     * Derive the domain of an Inertia page component ("Seller/Shipments/index").
     */
    public function fromPageComponent(string $component): ?string
    {
        return $this->normalize(Str::before(str_replace('\\', '/', ltrim($component, '/')), '/'));
    }

    /**
     * @return array<string, array{key: string, label: string, color: string, description: string}>
     */
    public function catalog(): array
    {
        $catalog = [];

        foreach (self::DOMAINS as $domain) {
            $catalog[$domain] = ['key' => $domain] + self::META[$domain];
        }

        return $catalog;
    }
}
