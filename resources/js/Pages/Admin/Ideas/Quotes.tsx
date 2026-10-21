import React from "react";
import { Head, Link } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";
import QuoteBoard from "@/Components/Procurement/QuoteBoard";
import { SkHeader } from "@/Components/StockKeeper/skKit";
import type { QuoteBoardProps } from "@/types/procurement";

/** An idea's supplier quotes and costs, read-only: procurement takes them in its own app. */
export default function AdminIdeaQuotes(props: QuoteBoardProps) {
    return (
        <>
            <Head title={`Quotes: ${props.idea.name}`} />
            <SkHeader
                title={`Quotes for ${props.idea.name}`}
                subtitle="What procurement found, and what each would cost on the shelf. Approve the idea from Product ideas when one is worth buying."
                actions={
                    <Link href={route(props.ideasRoute)} className="text-[14px] font-semibold text-primary">
                        All ideas
                    </Link>
                }
            />
            <QuoteBoard {...props} />
        </>
    );
}

AdminIdeaQuotes.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
