<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Each role's shipment board has a way in.
 *
 * Every board was built, wired to the shared shipments domain and covered by
 * tests that called its route directly — and three of the four were unreachable
 * from the running app:
 *
 *   - DeliveryLayout's bottom nav offered Dashboard, My Delivery and Profile.
 *     Nothing pointed at the freight board, so a courier could not open the runs
 *     waiting for a driver. Every shipment a seller or admin raised looked like
 *     it never arrived.
 *   - StockKeeperSidebar listed Dashboard, Inventory, Transfers, Orders and
 *     Stock Alerts. Nothing pointed at the shipment board, so the keeper could
 *     not reach the runs they are the origin or destination party on — which is
 *     what the 4-party gate sits waiting for.
 *   - AdminSidebar's "Shipments" pointed at /inventory/replenish, whose
 *     controller serves five hardcoded demo rows. So the admin board read a
 *     fixed 5 while the seller's read the real records, and the two were never
 *     going to agree because they were different screens over different data.
 *
 * A route test cannot catch any of that: the routes were fine. This asserts the
 * navigation actually names them, which is the part that was missing. Reading
 * the source is crude, but there is no JS test runner configured and the
 * alternative is no guard at all.
 */
class ShipmentBoardsAreReachableTest extends TestCase
{
    /**
     * Navigation file => the route its shipment link must resolve to.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function navigationProvider(): array
    {
        return [
            'courier bottom nav' => [
                'resources/js/Layouts/DeliveryLayout.tsx',
                'delivery.shipments.index',
            ],
            'stock keeper sidebar' => [
                'resources/js/Components/Navigation/StockKeeper/StockKeeperSidebar.tsx',
                'stock_keeper.shipments.index',
            ],
            // The seller reaches it from the "More" menu rather than the bottom
            // bar, which is fine — it just has to be somewhere.
            'seller menu' => [
                'resources/js/Pages/Seller/Menu/Index.tsx',
                'seller.shipments.index',
            ],
        ];
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('navigationProvider')]
    public function the_navigation_points_at_the_shipment_board(string $file, string $routeName): void
    {
        $path = base_path($file);

        if (! file_exists($path)) {
            $this->markTestSkipped("{$file} is not present; update this test if the nav moved.");
        }

        $source = (string) file_get_contents($path);
        $uri = '/' . ltrim((string) Route::getRoutes()->getByName($routeName)?->uri(), '/');

        $this->assertTrue(
            str_contains($source, $routeName) || str_contains($source, "\"{$uri}\""),
            "{$file} must link to the shipment board, by route name ({$routeName}) or path ({$uri}). "
                . 'The board is unreachable from the running app without it.'
        );
    }

    #[Test]
    public function the_admin_sidebar_shipments_link_is_the_real_board_not_the_demo_screen(): void
    {
        $source = (string) file_get_contents(
            base_path('resources/js/Components/Navigation/Admin/AdminSidebar.tsx')
        );

        // The label and the destination have to describe the same screen.
        $this->assertStringContainsString(
            '"/inventory/shipments"',
            $source,
            'The admin sidebar must link "Shipments" to the shared shipment board.'
        );

        $replenishIsLabelledShipments = (bool) preg_match(
            '#href="/inventory/replenish".*?primary="Shipments"#s',
            $source,
        );

        $this->assertFalse(
            $replenishIsLabelledShipments,
            'Admin\\Inventory\\ReplenishController serves five hardcoded demo rows, so labelling it '
                . '"Shipments" makes the admin board disagree with every other role for no visible reason.'
        );
    }
}
