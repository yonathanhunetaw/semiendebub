<?php

declare(strict_types=1);

namespace Tests\Feature\Storefront;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * What crawlers see: the sitemap, robots.txt and the indexing headers.
 */
class SeoTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        config(['subdomains.base_domain' => 'localhost']);

        $this->store = Store::factory()->create(['name' => 'Main Store', 'status' => 'active']);
        config(['storefront.store_id' => $this->store->id]);
    }

    private function item(string $status, bool $onSale): Item
    {
        $item = Item::factory()->create(['status' => $status]);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        if ($onSale) {
            StoreVariant::factory()->create([
                'store_id' => $this->store->id,
                'item_variant_id' => $variant->id,
                'item_id' => $item->id,
                'active' => true,
            ]);
        }

        return $item;
    }

    #[Test]
    public function the_sitemap_lists_only_items_the_shop_will_serve(): void
    {
        $live = $this->item('active', true);
        $inactive = $this->item('inactive', true);
        $unlisted = $this->item('active', false);

        $response = $this->get('/sitemap.xml')->assertOk();
        $xml = $response->getContent();

        $this->assertStringContainsString('application/xml', $response->headers->get('Content-Type'));
        $this->assertStringContainsString(route('storefront.index'), $xml);
        $this->assertStringContainsString(route('storefront.items.show', $live), $xml);
        $this->assertStringNotContainsString(route('storefront.items.show', $inactive), $xml);
        $this->assertStringNotContainsString(route('storefront.items.show', $unlisted), $xml);
        $this->assertStringNotContainsString('/login', $xml);
    }

    #[Test]
    public function every_listed_item_url_actually_answers_200(): void
    {
        $live = $this->item('active', true);

        $this->get(route('storefront.items.show', $live))->assertOk();
    }

    #[Test]
    public function robots_on_the_root_domain_points_at_the_sitemap_and_hides_private_paths(): void
    {
        $body = $this->get('http://localhost/robots.txt')->assertOk()->getContent();

        $this->assertStringContainsString('Sitemap: ', $body);
        $this->assertStringContainsString('Allow: /shop', $body);
        $this->assertStringContainsString('Disallow: /login', $body);
        $this->assertStringContainsString('Disallow: /c/', $body);
        $this->assertStringContainsString('Disallow: /downloads', $body);
    }

    #[Test]
    public function robots_on_a_role_subdomain_blocks_everything(): void
    {
        $body = $this->get('http://admin.localhost/robots.txt')->assertOk()->getContent();

        $this->assertStringContainsString('Disallow: /', $body);
        $this->assertStringNotContainsString('Sitemap', $body);
        $this->assertStringNotContainsString('Allow:', $body);
    }

    #[Test]
    public function every_response_carries_the_hardening_headers(): void
    {
        $response = $this->get('/shop');

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertNull($response->headers->get('X-Robots-Tag'));
    }

    #[Test]
    public function sign_in_pages_and_role_subdomains_are_marked_noindex(): void
    {
        $this->get('/login')->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('/downloads')->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('http://admin.localhost/login')->assertHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    #[Test]
    public function the_item_page_head_is_rendered_on_the_server_with_product_markup(): void
    {
        $live = $this->item('active', true);

        $html = $this->get(route('storefront.items.show', $live))->assertOk()->getContent();

        $this->assertStringContainsString('<link rel="canonical" href="' . route('storefront.items.show', $live) . '">', $html);
        $this->assertStringContainsString('application/ld+json', $html);
        $this->assertStringContainsString('"@type":"Product"', $html);
        $this->assertStringContainsString('property="og:title"', $html);
    }

    #[Test]
    public function a_search_results_page_is_noindex_and_canonical_to_the_shop(): void
    {
        $html = $this->get('/shop?search=pen')->assertOk()->getContent();

        $this->assertStringContainsString('<meta name="robots" content="noindex,follow">', $html);
        $this->assertStringContainsString('<link rel="canonical" href="' . route('storefront.index') . '">', $html);
        $this->assertStringNotContainsString('noindex', $this->get('/shop')->getContent());
    }
}
