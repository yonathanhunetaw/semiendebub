import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import SellerLayout from "@/Layouts/SellerLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkChips } from "@/Components/StockKeeper/skKit";
import { PriceCheckCards } from "@/Components/Procurement/PriceCheckPanel";
import type { PriceCheckListProps, PriceCheckStatus } from "@/types/procurement";

/** The store's price checks: products to look up at other shops. */
export default function SellerPriceChecks({ checks = [], tab, counts, toVerify, routePrefix }: PriceCheckListProps) {
    return (
        <>
            <Head title="Price checks" />

            <div className="min-h-screen bg-surface-container-low px-4 pb-28">
                <section className="flex items-center gap-3 pb-3 pt-4">
                    <Link
                        href={route("seller.menu.index")}
                        aria-label="Back"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container-high/60 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </Link>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                        <span className="material-symbols-outlined text-2xl">price_check</span>
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">Price checks</h1>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                            {toVerify > 0 ? `${toVerify} prices waiting for you to check` : "What other shops charge"}
                        </p>
                    </div>
                </section>

                <div className="mb-3">
                    <SkChips<PriceCheckStatus>
                        value={tab}
                        onChange={(next) => router.get(route(`${routePrefix}.index`), next === "open" ? {} : { tab: next }, { preserveState: true, replace: true })}
                        options={[
                            { value: "open", label: "Open", count: counts.open || undefined },
                            { value: "closed", label: "Done", count: counts.closed || undefined },
                        ]}
                    />
                </div>

                {checks.length === 0 ? (
                    <EmptyState framed icon="price_check" title="Nothing to check" description="When the store wants prices for a product, it shows up here." />
                ) : (
                    <PriceCheckCards checks={checks} routePrefix={routePrefix} />
                )}
            </div>
        </>
    );
}

SellerPriceChecks.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
