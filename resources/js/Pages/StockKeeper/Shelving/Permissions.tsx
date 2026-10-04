import PermissionsTable from "@/Components/Inventory/PermissionsTable";
import { PageHeader } from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { PermissionAbility, StorePerson } from "@/types/refills";
import { Head, Link } from "@inertiajs/react";
import { Button } from "@mui/material";
import React from "react";

interface Props {
    abilities?: PermissionAbility[];
    /** Tick key → label. */
    ticks?: Record<string, string>;
    /** Who runs the viewer's store. */
    people?: StorePerson[];
}

/** Who may do what with shelves and refills. Read-only. */
export default function ShelvingPermissions({ abilities = [], ticks = {}, people = [] }: Props): React.ReactElement {
    return (
        <>
            <Head title="Who can do what" />
            <PageHeader
                title="Who can do what"
                subtitle="Shelves, refills and their approvals"
                action={
                    <Button component={Link} href={route("stock_keeper.shelving.index")} variant="outlined">
                        Back to shelving
                    </Button>
                }
            />
            <PermissionsTable abilities={abilities} people={people} ticks={ticks} />
        </>
    );
}

ShelvingPermissions.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
