import React from "react";
import { Head, Link } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import QuoteBoard from "@/Components/Procurement/QuoteBoard";
import { SkHeader } from "@/Components/StockKeeper/skKit";
import type { QuoteBoardProps } from "@/types/procurement";

/** Take supplier quotes on an idea and see what each would cost on the shelf. */
export default function ProcurementIdeaQuotes(props: QuoteBoardProps) {
    return (
        <>
            <Head title={`Quotes: ${props.idea.name}`} />
            <SkHeader
                title={`Quotes for ${props.idea.name}`}
                subtitle="Each quote is worked out from the exchange rate, the route and the tariff. VAT and withholding are paid at customs but claimed back, so they are not part of the cost."
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

ProcurementIdeaQuotes.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
