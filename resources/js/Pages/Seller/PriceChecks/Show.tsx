import React from "react";
import { Head, Link } from "@inertiajs/react";
import SellerLayout from "@/Layouts/SellerLayout";
import PriceCheckPanel from "@/Components/Procurement/PriceCheckPanel";
import type { PriceCheck } from "@/types/procurement";

interface Props {
    check: PriceCheck;
    routePrefix: string;
    today: string;
}

/** One price check: the shops to visit and the prices written down. */
export default function SellerPriceCheck({ check, routePrefix, today }: Props) {
    return (
        <>
            <Head title={`Price check: ${check.subject}`} />

            <div className="min-h-screen bg-surface-container-low px-4 pb-28">
                <section className="flex items-center gap-3 pb-3 pt-4">
                    <Link
                        href={route(`${routePrefix}.index`)}
                        aria-label="Back"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container-high/60 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">{check.subject}</h1>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">Price check · {check.store.name}</p>
                    </div>
                </section>

                <PriceCheckPanel check={check} routePrefix={routePrefix} today={today} />
            </div>
        </>
    );
}

SellerPriceCheck.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
