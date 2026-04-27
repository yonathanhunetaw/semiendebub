import SellerLayout from "@/Layouts/SellerLayout";
import { Head } from "@inertiajs/react";
import { Box, Grid, Paper, Typography } from "@mui/material";
import React from "react";

interface Customer {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    city?: string;
    creator?: {
        first_name?: string;
        last_name?: string;
    } | null;
    carts?: { id: number }[];
}

const fullName = (customer: Customer) =>
    [customer.first_name, customer.last_name].filter(Boolean).join(" ");

export default function Show({ customer }: { customer: Customer }) {
    return (
        <>
            <Head title={fullName(customer) || "Customer"} />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {fullName(customer) || "Customer"}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Customer detail, contact information, and cart relationship summary.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="overline" color="text.secondary">Contact</Typography>
                        <Typography variant="body1" sx={{ mt: 2 }}>Email: {customer.email || "N/A"}</Typography>
                        <Typography variant="body1">Phone: {customer.phone_number || "N/A"}</Typography>
                        <Typography variant="body1">City: {customer.city || "N/A"}</Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="overline" color="text.secondary">Activity</Typography>
                        <Typography variant="body1" sx={{ mt: 2 }}>
                            Created by: {[customer.creator?.first_name, customer.creator?.last_name].filter(Boolean).join(" ") || "Unknown"}
                        </Typography>
                        <Typography variant="body1">
                            Linked carts: {customer.carts?.length ?? 0}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
