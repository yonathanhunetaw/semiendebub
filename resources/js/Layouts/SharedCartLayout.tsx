import FlashToast from "@/Components/Shared/FlashToast";
import { Head } from "@inertiajs/react";
import { CssBaseline } from "@mui/material";
import React from "react";

/**
 * The customer's shell on a shared cart link: no staff navigation, no login,
 * just the store's name and the page. Phone-first.
 */
export default function SharedCartLayout({ store, children }: { store?: string | null; children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-on-surface [background-image:radial-gradient(circle_at_top,rgb(var(--primary)/0.10),transparent_32%)]">
            <CssBaseline />
            <Head>
                <title>{store ? `${store} | Your order` : "Your order"}</title>
            </Head>
            <FlashToast bottomClass="bottom-[calc(24px+env(safe-area-inset-bottom))]" />

            <header className="border-b border-outline-variant/70 bg-surface-container-lowest/90 backdrop-blur-lg">
                <div className="mx-auto flex h-14 max-w-[760px] items-center gap-3 px-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-on-primary">
                        <span className="material-symbols-outlined text-[20px] [font-variation-settings:'FILL'_1]">storefront</span>
                    </span>
                    <span className="truncate text-[16px] font-extrabold">{store ?? "Duka"}</span>
                </div>
            </header>

            <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-5">{children}</main>
        </div>
    );
}
