import { SellerCard, SellerHeader, sellerAvatarText, sellerHeaderButtonSx, sellerName } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Avatar, Box, Chip, IconButton, Stack, Typography } from "@mui/material";
import React from "react";

interface Customer {
    id: number;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    city?: string;
    /** Present means an individual, priced with VAT. Absent means a business. */
    tin_number?: string | null;
}

export default function Index({ customers = [] }: { customers?: Customer[] }) {
    return (
        <>
            <Head title="Customers" />

            <SellerHeader
                title="Customers"
                action={(
                    <IconButton
                        component={Link}
                        href={route("seller.customers.create")}
                        sx={sellerHeaderButtonSx}
                    >
                        <AddRoundedIcon />
                    </IconButton>
                )}
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    {customers.map((customer) => {
                        const fullName = sellerName([customer.first_name, customer.last_name]);

                        return (
                            <SellerCard
                                key={customer.id}
                                component={Link}
                                href={route("seller.customers.show", customer.id)}
                                sx={{ textDecoration: "none", color: "inherit" }}
                            >
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText" }}>
                                        {sellerAvatarText(fullName)}
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                                            <Typography sx={{ fontWeight: 700 }} noWrap>
                                                {fullName || `Customer #${customer.id}`}
                                            </Typography>
                                            {/* Which pricing a customer gets is
                                                the thing a seller needs to see
                                                before opening a cart for them. */}
                                            <Chip
                                                size="small"
                                                variant="outlined"
                                                color={customer.tin_number ? "primary" : "default"}
                                                label={customer.tin_number ? "Individual" : "Business"}
                                                sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700, flexShrink: 0 }}
                                            />
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary" noWrap>
                                            {[customer.phone_number, customer.city].filter(Boolean).join(" • ") || "No phone or city yet"}
                                        </Typography>
                                    </Box>
                                    <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
                                </Stack>
                            </SellerCard>
                        );
                    })}
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                    Total {customers.length}
                </Typography>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
