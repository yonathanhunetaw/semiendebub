import React from "react";
import { Head } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import IdeaBoard from "@/Components/Procurement/IdeaBoard";
import { SkButton, SkHeader } from "@/Components/StockKeeper/skKit";
import type { ProductIdeaBoardProps } from "@/types/procurement";

/** Every store's product ideas, and procurement's own "have you considered this?". */
export default function ProcurementIdeas(props: ProductIdeaBoardProps) {
    return (
        <>
            <Head title="Product ideas" />
            <IdeaBoard
                {...props}
                allowEveryStore
                suggestTitle="Have you considered this?"
                header={(open) => (
                    <SkHeader
                        title="Product ideas"
                        subtitle="What the stores think we should sell, and what you think they should consider. Ideas a global admin sends you are under With procurement."
                        actions={
                            props.canSuggest ? (
                                <SkButton icon="lightbulb" onClick={open}>
                                    Have you considered…
                                </SkButton>
                            ) : null
                        }
                    />
                )}
            />
        </>
    );
}

ProcurementIdeas.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
