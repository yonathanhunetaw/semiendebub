import React from "react";
import { Head, Link } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";
import PriceCheckPanel from "@/Components/Procurement/PriceCheckPanel";
import { SkHeader } from "@/Components/StockKeeper/skKit";
import type { PriceCheck } from "@/types/procurement";

interface Props {
    check: PriceCheck;
    routePrefix: string;
    today: string;
}

/** One price check: every price the sellers wrote down, to verify, and the summary of verified ones. */
export default function AdminPriceCheck({ check, routePrefix, today }: Props) {
    return (
        <>
            <Head title={`Price check: ${check.subject}`} />
            <SkHeader
                title={check.subject}
                subtitle={`Price check at ${check.store.name}. Someone other than whoever wrote a price down verifies it; only verified prices count.`}
                actions={
                    <Link href={route(`${routePrefix}.index`)} className="text-[14px] font-semibold text-primary">
                        All price checks
                    </Link>
                }
            />
            <PriceCheckPanel check={check} routePrefix={routePrefix} today={today} />
        </>
    );
}

AdminPriceCheck.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
