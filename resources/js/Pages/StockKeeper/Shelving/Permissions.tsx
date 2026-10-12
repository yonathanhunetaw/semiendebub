import PermissionsTable from "@/Components/Inventory/PermissionsTable";
import { SkButton, SkHeader } from "@/Components/StockKeeper/skKit";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
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

/**
 * Who may do what with shelves and refills. Read-only. The table is shared
 * with the seller app (Components/Inventory/PermissionsTable); its matrix
 * scrolls sideways on a phone rather than turning into cards.
 */
export default function ShelvingPermissions({ abilities = [], ticks = {}, people = [] }: Props): React.ReactElement {
    return (
        <>
            <Head title="Who can do what" />
            <SkHeader
                title="Who can do what"
                subtitle="Shelves, refills and who approves them. Ask a manager to change any of it."
                actions={
                    <Link href={route("stock_keeper.shelving.index")}>
                        <SkButton variant="outline" icon="arrow_back">Back to shelving</SkButton>
                    </Link>
                }
            />
            <PermissionsTable abilities={abilities} people={people} ticks={ticks} />
        </>
    );
}

ShelvingPermissions.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
