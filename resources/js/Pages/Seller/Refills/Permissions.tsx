import PermissionsTable from "@/Components/Inventory/PermissionsTable";
import SellerLayout from "@/Layouts/SellerLayout";
import type { PermissionAbility, StorePerson } from "@/types/refills";
import { Head, Link } from "@inertiajs/react";
import React from "react";

interface Props {
    abilities?: PermissionAbility[];
    /** Tick key → label. */
    ticks?: Record<string, string>;
    /** Who runs the viewer's store. */
    people?: StorePerson[];
}

/** Who may do what with shelves and refills. Read-only. */
export default function RefillPermissions({ abilities = [], ticks = {}, people = [] }: Props): React.ReactElement {
    return (
        <>
            <Head title="Who can do what" />

            <div className="min-h-screen bg-surface-container-low px-4 pb-28 pt-4">
                <section className="mb-4 flex items-center space-x-3">
                    <Link
                        href={route("seller.refills.index")}
                        aria-label="Back to refill requests"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container-high/60 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </Link>
                    <div>
                        <h1 className="text-[17px] font-bold tracking-tight text-on-surface">Who can do what</h1>
                        <p className="text-[11px] text-on-surface-variant">Shelves, refills and their approvals</p>
                    </div>
                </section>

                <PermissionsTable abilities={abilities} people={people} ticks={ticks} />
            </div>
        </>
    );
}

RefillPermissions.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
