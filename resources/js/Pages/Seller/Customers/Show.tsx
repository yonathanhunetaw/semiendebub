import { SellerCard, SellerHeader, sellerHeaderButtonSx, sellerName } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router } from "@inertiajs/react";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
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
    created_at?: string;
    updated_at?: string;
}

export default function Show({ customer }: { customer: Customer }) {
    const fullName = sellerName([customer.first_name, customer.last_name]);

    const removeCustomer = () => {
        if (!window.confirm("Delete this customer?")) {
            return;
        }

        router.delete(route("seller.customers.destroy", customer.id));
    };

    return (
        <>
            <Head title={fullName || "Customer"} />

            <SellerHeader
                title={fullName || "Customer"}
                backHref={route("seller.customers.index")}
                action={(
                    <IconButton
                        component={Link}
                        href={route("seller.customers.edit", customer.id)}
                        sx={sellerHeaderButtonSx}
                    >
                        <EditRoundedIcon />
                    </IconButton>
                )}
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    <SellerCard>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>Contact</Typography>
                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                                Email
                            </Typography>
                            <Typography>{customer.email || "No email yet"}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Phone
                            </Typography>
                            <Typography component="a" href={customer.phone_number ? `tel:${customer.phone_number}` : undefined} sx={{ color: "inherit", textDecoration: "none" }}>
                                {customer.phone_number || "No phone yet"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                City
                            </Typography>
                            <Typography>{customer.city || "Not set"}</Typography>
                        </Stack>
                    </SellerCard>

                    <SellerCard>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>Activity</Typography>
                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                                Created by
                            </Typography>
                            <Typography>
                                {sellerName([customer.creator?.first_name, customer.creator?.last_name]) || "Unknown"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Linked carts
                            </Typography>
                            <Typography>{customer.carts?.length ?? 0}</Typography>
                        </Stack>
                    </SellerCard>

                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<DeleteRoundedIcon />}
                        onClick={removeCustomer}
                        sx={{ borderRadius: 3, textTransform: "none", mb: 1 }}
                    >
                        Delete Customer
                    </Button>
                </Stack>
            </Box>
        </>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
