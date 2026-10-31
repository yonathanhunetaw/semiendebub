import FlashToast from "@/Components/Shared/FlashToast";
import UserBottomNav from "@/Components/Navigation/User/UserBottomNav";
import { CssBaseline } from "@mui/material";
import { Link, usePage } from "@inertiajs/react";
import React from "react";

/**
 * The online shop's own pages past the catalogue (checkout, My orders): the
 * shop's name with a way back, the page, and the phone bottom bar. Built like
 * SharedCartLayout, so an order looks the same whichever way it was reached.
 */
export default function ShopPageLayout({ title, children }: { title?: string | null; children: React.ReactNode }) {
    const user = (usePage().props as { auth?: { user?: { id: number } | null } }).auth?.user ?? null;

    return (
        <div className="min-h-screen bg-background text-on-surface [background-image:radial-gradient(circle_at_top,rgb(var(--primary)/0.10),transparent_32%)]">
            <CssBaseline />
            <FlashToast bottomClass="bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6" />

            <header className="border-b border-outline-variant/70 bg-surface-container-lowest/90 backdrop-blur-lg">
                <div className="mx-auto flex h-14 max-w-[760px] items-center gap-3 px-4">
                    <Link href={route("storefront.index")} className="flex min-w-0 items-center gap-3" aria-label="Back to the shop">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-on-primary">
                            <span className="material-symbols-outlined text-[20px] [font-variation-settings:'FILL'_1]">storefront</span>
                        </span>
                        <span className="truncate text-[16px] font-extrabold">{title ?? "Duka"}</span>
                    </Link>
                    <span className="flex-1" />
                    <Link href={route("storefront.orders.index")} className="hidden items-center gap-1 rounded-[999px] px-3 py-1.5 text-[13px] font-bold text-primary hover:bg-primary-container/40 md:flex">
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        My orders
                    </Link>
                    <Link href={route("storefront.index")} className="hidden items-center gap-1 rounded-[999px] px-3 py-1.5 text-[13px] font-bold text-on-surface-variant hover:bg-surface-container md:flex">
                        Back to the shop
                    </Link>
                </div>
            </header>

            <main className="mx-auto w-full max-w-[760px] px-4 pb-28 pt-5 md:pb-16">{children}</main>

            <UserBottomNav isAuthenticated={user !== null} />
        </div>
    );
}
