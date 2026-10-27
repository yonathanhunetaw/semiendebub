import FlashToast from "@/Components/Shared/FlashToast";
import StockKeeperBottomNav from "@/Components/Navigation/StockKeeper/StockKeeperBottomNav";
import StockKeeperSideNav from "@/Components/Navigation/StockKeeper/StockKeeperSideNav";
import { activeSkItem } from "@/Components/Navigation/StockKeeper/stockKeeperNav";
import { stackedTableSx, useStackedTableLabels } from "@/Components/Shared/stackedTables";
import ScanSheet from "@/Components/StockKeeper/ScanSheet";
import { Head, Link, router, usePage } from "@inertiajs/react";
import { Box, CssBaseline } from "@mui/material";
import React, { useRef, useState } from "react";

/**
 * The stock keeper shell, Tailwind-first like the seller app.
 *
 *   < lg (phones, tablets)  top bar + floating bottom nav with a "More" sheet
 *   ≥ lg (laptops, desktop) fixed sidebar, content beside it
 *
 * Pages not yet rebuilt in Tailwind still use MUI tables; those read as
 * labelled cards below md through stackedTables, so nothing scrolls sideways.
 */
export default function StockKeeperLayout({ children }: { children: React.ReactNode }) {
    const { url } = usePage();
    const contentRef = useRef<HTMLDivElement | null>(null);
    const section = activeSkItem(url);
    const [scanning, setScanning] = useState(false);
    // A scanned barcode (or typed SKU) opens its item.
    const openCode = (code: string) => router.get(route("stock_keeper.scan"), { code });

    useStackedTableLabels(contentRef);

    return (
        <div className="min-h-screen bg-background text-on-surface [background-image:radial-gradient(circle_at_top,rgb(var(--primary)/0.10),transparent_32%)]">
            <CssBaseline />
            <Head>
                <title>Stock Keeper | Duka</title>
            </Head>
            <FlashToast />

            <StockKeeperSideNav onScan={() => setScanning(true)} />

            <div className="lg:pl-[256px]">
                {/* Phone/tablet top bar; on desktop the sidebar carries the brand. */}
                <header className="sticky top-0 z-20 border-b border-outline-variant/70 bg-surface-container-lowest/90 backdrop-blur-lg lg:hidden">
                    <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-3 px-4 sm:px-6">
                        <Link href={route("stock_keeper.dashboard")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-on-primary">
                            <span className="material-symbols-outlined text-[20px] [font-variation-settings:'FILL'_1]">warehouse</span>
                        </Link>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-extrabold leading-tight">{section?.label ?? "Stock Keeper"}</p>
                            <p className="truncate text-[12px] text-on-surface-variant">{section?.hint ?? "Warehouse desk"}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setScanning(true)}
                            aria-label="Scan a barcode"
                            className="flex h-10 items-center gap-1.5 rounded-[12px] bg-primary px-3 text-[13px] font-bold text-on-primary shadow-sm active:scale-95"
                        >
                            <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                            <span className="hidden sm:inline">Scan</span>
                        </button>
                    </div>
                </header>

                {/* `nav-pad` clears the bottom nav while it is up (app.css). */}
                <main className="nav-pad mx-auto w-full min-w-0 max-w-[1400px] px-3 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12">
                    <Box ref={contentRef} sx={(t) => ({ minWidth: 0, ...stackedTableSx(t) })}>
                        {children}
                    </Box>
                </main>
            </div>

            <StockKeeperBottomNav />
            <ScanSheet open={scanning} onClose={() => setScanning(false)} onCode={openCode} />
        </div>
    );
}
