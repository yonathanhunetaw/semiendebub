import React from "react";
import { Head, Link } from "@inertiajs/react";
import SellerLayout from "@/Layouts/SellerLayout";
import IdeaBoard from "@/Components/Procurement/IdeaBoard";
import type { ProductIdeaBoardProps } from "@/types/procurement";

/** The store's product ideas: suggest what customers ask for, and follow where each one is. */
export default function SellerIdeas(props: ProductIdeaBoardProps) {
    return (
        <>
            <Head title="Product ideas" />

            <div className="min-h-screen bg-surface-container-low px-4 pb-28">
                <IdeaBoard
                    {...props}
                    header={(open) => (
                        <section className="flex items-center justify-between gap-3 pb-3 pt-4">
                            <div className="flex min-w-0 items-center space-x-3">
                                <Link
                                    href={route("seller.menu.index")}
                                    aria-label="Back"
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container-high/60 active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                                </Link>
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                                    <span className="material-symbols-outlined text-2xl">lightbulb</span>
                                </div>
                                <div className="min-w-0">
                                    <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">Product ideas</h1>
                                    <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">What customers ask for that we do not sell</p>
                                </div>
                            </div>
                            {props.canSuggest ? (
                                <button
                                    type="button"
                                    onClick={open}
                                    className="flex shrink-0 items-center gap-1 rounded-[12px] bg-primary px-3 py-2 text-[13px] font-bold text-on-primary shadow-sm active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                    Suggest
                                </button>
                            ) : null}
                        </section>
                    )}
                />
            </div>
        </>
    );
}

SellerIdeas.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
