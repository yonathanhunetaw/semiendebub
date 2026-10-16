<?php

declare(strict_types=1);

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Every Inertia::render('Some/Page') in the app and the routes names a page file under
 * resources/js/Pages. A feature test that only asserts 200 cannot see a missing page:
 * the server answers fine and the browser shows a blank screen. Admin → Stores → Add
 * Store and Edit did exactly that until the browser sweep (e2e/admin/pages.spec.ts) hit them.
 */
class InertiaPagesExistTest extends TestCase
{
    /**
     * Renders in code no route reaches, so no one can open them. Delete them, or route
     * them and add the page, and take them off this list.
     */
    private const UNROUTED = [
        'Customer/Index',      // Admin\Client\Customer\CustomerController: routes/web/admin/customer/customer.php is never loaded
        'Seller/Carts/Show',   // Seller\MenuController::show has no route
    ];

    #[Test]
    public function every_rendered_page_has_a_file(): void
    {
        $missing = [];

        foreach ([app_path(), base_path('routes')] as $root) {
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));

            foreach ($files as $file) {
                if ($file->getExtension() !== 'php') {
                    continue;
                }

                preg_match_all("/Inertia::render\\(\\s*['\"]([^'\"]+)['\"]/", (string) file_get_contents($file->getPathname()), $matches);

                foreach ($matches[1] as $page) {
                    $base = resource_path("js/Pages/{$page}");

                    if (! is_file("{$base}.tsx") && ! is_file("{$base}.jsx") && ! in_array($page, self::UNROUTED, true)) {
                        $missing[] = "{$page} (".str_replace(base_path().'/', '', $file->getPathname()).')';
                    }
                }
            }
        }

        $this->assertSame([], array_values(array_unique($missing)), 'Rendered pages with no file under resources/js/Pages');
    }
}
