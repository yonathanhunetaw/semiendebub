import React from "react";
import { Head, usePage } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";
import IdeaBoard from "@/Components/Procurement/IdeaBoard";
import { SkButton, SkHeader } from "@/Components/StockKeeper/skKit";
import type { ProductIdeaBoardProps } from "@/types/procurement";

/**
 * Product ideas for the active store (and the ones for every store). The
 * store's admin sends them to price check; a global admin sends them on to
 * procurement and approves.
 */
export default function AdminIdeas(props: ProductIdeaBoardProps) {
    const { isGlobalAdmin } = usePage<{ isGlobalAdmin?: boolean }>().props;

    return (
        <>
            <Head title="Product ideas" />
            <IdeaBoard
                {...props}
                allowEveryStore={Boolean(isGlobalAdmin)}
                header={(open) => (
                    <SkHeader
                        title="Product ideas"
                        subtitle="Products the stores and procurement think we should sell. Send one to price check with the price the store would sell it for; a global admin sends it on to procurement."
                        actions={
                            props.canSuggest ? (
                                <SkButton icon="lightbulb" onClick={open}>
                                    Suggest a product
                                </SkButton>
                            ) : null
                        }
                    />
                )}
            />
        </>
    );
}

AdminIdeas.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
