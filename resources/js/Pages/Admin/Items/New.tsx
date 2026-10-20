import * as React from "react";
import { Head } from "@inertiajs/react";
import { Card, Stack, Typography } from "@mui/material";

import AdminLayout from "@/Layouts/AdminLayout";
import BasicsPart, { type CategoryOption } from "@/Components/Admin/ItemSetup/BasicsPart";
import { cardSx } from "@/Components/Admin/ItemSetup/parts";

/** A new item starts with its basics; saving opens its setup page where everything else is done. */
export default function New({ categories = [] }: { categories?: CategoryOption[] }): React.ReactElement {
    return (
        <>
            <Head title="New item" />
            <Stack spacing={2} sx={{ p: { xs: 1, md: 2 }, maxWidth: 720 }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>New item</Typography>
                <Typography variant="body2" color="text.secondary">
                    Start with the basics. When you save, the same page opens with the options, barcodes, prices, shelf and stock, each saved on its own.
                </Typography>
                <Card sx={cardSx}>
                    <BasicsPart itemId={null} saved={{ product_name: "", product_description: "", packaging_details: "", item_category_id: null, status: "draft" }} categories={categories} />
                </Card>
            </Stack>
        </>
    );
}

New.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
