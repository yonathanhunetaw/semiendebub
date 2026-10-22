<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Services\StorefrontCatalogService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

/**
 * What crawlers are told: /sitemap.xml and /robots.txt.
 *
 * Only the root domain's public pages are listed. Every role subdomain is
 * closed to crawlers, and the token links (cart share, clock QR) never appear.
 */
class SeoController extends Controller
{
    /** Paths that must never be crawled or indexed on the root domain. */
    public const PRIVATE_PATHS = [
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/shop/cart',
        '/shop/checkout',
        '/c/',
        '/clock/',
        '/downloads',
        '/up',
    ];

    public function __construct(private readonly StorefrontCatalogService $catalog)
    {
    }

    public function sitemap(): Response
    {
        $xml = Cache::remember('seo.sitemap.xml', now()->addHour(), fn (): string => $this->buildSitemap());

        return response($xml, 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }

    public function robots(Request $request): Response
    {
        $lines = $this->isRootHost($request)
            ? [
                'User-agent: *',
                'Allow: /$',
                'Allow: /shop',
                ...array_map(fn (string $path): string => 'Disallow: ' . $path, self::PRIVATE_PATHS),
                '',
                'Sitemap: ' . url('/sitemap.xml'),
            ]
            : ['User-agent: *', 'Disallow: /'];

        return response(implode("\n", $lines) . "\n", 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    private function isRootHost(Request $request): bool
    {
        $base = (string) config('subdomains.base_domain');

        return $base === '' || $request->getHost() === $base;
    }

    private function buildSitemap(): string
    {
        $urls = [['loc' => url('/'), 'lastmod' => null], ['loc' => route('storefront.index'), 'lastmod' => null]];

        $store = $this->catalog->resolveStore();

        if ($store !== null) {
            foreach ($this->catalog->sitemapItems($store) as $item) {
                $urls[] = [
                    'loc' => route('storefront.items.show', $item),
                    'lastmod' => $item->updated_at?->toAtomString(),
                ];
            }
        }

        $body = '';
        foreach ($urls as $url) {
            $body .= '<url><loc>' . e($url['loc']) . '</loc>'
                . ($url['lastmod'] ? '<lastmod>' . $url['lastmod'] . '</lastmod>' : '')
                . '</url>';
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'
            . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . $body . '</urlset>';
    }
}
