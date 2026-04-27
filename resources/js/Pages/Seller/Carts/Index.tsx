import { SellerCard, SellerHeader, SELLER_BRAND_DARK, sellerAvatarText, sellerHeaderButtonSx, sellerName } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Avatar, Box, Chip, IconButton, Stack, Typography } from "@mui/material";
import React from "react";

interface CartItem {
    id: number;
}

interface SellerCart {
    id: number;
    customer?: {
        first_name?: string;
        last_name?: string;
    } | null;
    seller?: {
        first_name?: string;
        last_name?: string;
    } | null;
    items?: CartItem[];
}

export default function Index({ carts = [] }: { carts?: SellerCart[] }) {
    return (
        <>
            <Head title="Seller Carts" />

            <SellerHeader
                title="Carts"
                action={(
                    <IconButton
                        component={Link}
                        href={route("seller.carts.create")}
                        sx={sellerHeaderButtonSx}
                    >
                        <AddRoundedIcon />
                    </IconButton>
                )}
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    {carts.map((cart) => {
                        const customerName = sellerName([
                            cart.customer?.first_name,
                            cart.customer?.last_name,
                        ]);
                        const sellerLabel = sellerName([
                            cart.seller?.first_name,
                            cart.seller?.last_name,
                        ]);

                        return (
                            <SellerCard
                                key={cart.id}
                                component={Link}
                                href={route("seller.carts.show", cart.id)}
                                sx={{ textDecoration: "none", color: "inherit" }}
                            >
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Avatar sx={{ bgcolor: SELLER_BRAND_DARK }}>
                                        {sellerAvatarText(customerName || `Cart ${cart.id}`)}
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700 }} noWrap>
                                            {customerName ? `${customerName}'s Cart` : `Cart #${cart.id}`}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" noWrap>
                                            {sellerLabel || "Seller not assigned"}
                                        </Typography>
                                    </Box>
                                    <Stack alignItems="flex-end" spacing={0.5}>
                                        <Chip label={`${cart.items?.length ?? 0} items`} size="small" />
                                        <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
                                    </Stack>
                                </Stack>
                            </SellerCard>
                        );
                    })}
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                    Total {carts.length}
                </Typography>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
