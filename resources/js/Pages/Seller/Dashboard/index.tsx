import { SellerCard, SellerHeader, SELLER_BRAND_DARK, sellerPrice } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PointOfSaleRoundedIcon from "@mui/icons-material/PointOfSaleRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import {
    Box,
    Button,
    Chip,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

interface SellerVariant {
    id: number;
    final_price?: number | null;
    store_discount_price?: number | null;
    store_price?: number | null;
    price?: number | null;
}

interface SellerItem {
    id: number;
    product_name: string;
    variants?: SellerVariant[];
}

interface SellerStore {
    store_name?: string;
    name?: string;
}

function itemPrice(item: SellerItem) {
    const prices = (item.variants ?? [])
        .map((variant) => variant.final_price ?? variant.store_discount_price ?? variant.store_price ?? variant.price)
        .filter((price): price is number => price != null);

    return prices.length ? Math.min(...prices) : null;
}

export default function Index({
    items = [],
    store,
}: {
    items?: SellerItem[];
    store?: SellerStore | null;
}) {
    const totalVariants = items.reduce((count, item) => count + (item.variants?.length ?? 0), 0);
    const lowestPrice = items
        .map(itemPrice)
        .filter((price): price is number => price != null)
        .sort((left, right) => left - right)[0] ?? null;

    return (
        <>
            <Head title="Seller Dashboard" />

            <SellerHeader
                title="Dashboard"
                subtitle={store?.store_name || store?.name || "Your store at a glance"}
            />

            <Box sx={{ px: 2, pt: 2 }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 1.5,
                    }}
                >
                    <SellerCard>
                        <Stack spacing={1}>
                            <StorefrontRoundedIcon sx={{ color: SELLER_BRAND_DARK }} />
                            <Typography variant="body2" color="text.secondary">
                                Live Items
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800 }}>
                                {items.length}
                            </Typography>
                        </Stack>
                    </SellerCard>
                    <SellerCard>
                        <Stack spacing={1}>
                            <Inventory2RoundedIcon sx={{ color: SELLER_BRAND_DARK }} />
                            <Typography variant="body2" color="text.secondary">
                                Ready Variants
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800 }}>
                                {totalVariants}
                            </Typography>
                        </Stack>
                    </SellerCard>
                    <SellerCard sx={{ gridColumn: "1 / -1" }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                            <Stack spacing={0.5}>
                                <PointOfSaleRoundedIcon sx={{ color: SELLER_BRAND_DARK }} />
                                <Typography variant="body2" color="text.secondary">
                                    Lowest visible price
                                </Typography>
                                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                                    {sellerPrice(lowestPrice)}
                                </Typography>
                            </Stack>
                            <Button
                                component={Link}
                                href={route("seller.items.index")}
                                variant="contained"
                                sx={{
                                    borderRadius: 3,
                                    textTransform: "none",
                                    bgcolor: SELLER_BRAND_DARK,
                                    "&:hover": { bgcolor: SELLER_BRAND_DARK },
                                }}
                            >
                                Open Catalog
                            </Button>
                        </Stack>
                    </SellerCard>
                </Box>

                <Stack spacing={1.5} sx={{ mt: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5 }}>
                        Quick Actions
                    </Typography>

                    {[
                        { label: "Browse catalog", href: route("seller.items.index"), note: "Search products and pricing." },
                        { label: "Review carts", href: route("seller.carts.index"), note: "Open active customer carts." },
                        { label: "View customers", href: route("seller.customers.index"), note: "Call, edit, and manage buyers." },
                    ].map((action) => (
                        <SellerCard key={action.label} component={Link} href={action.href} sx={{ textDecoration: "none", color: "inherit" }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                                <Box>
                                    <Typography sx={{ fontWeight: 700 }}>{action.label}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {action.note}
                                    </Typography>
                                </Box>
                                <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
                            </Stack>
                        </SellerCard>
                    ))}
                </Stack>

                <Stack spacing={1.5} sx={{ mt: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 0.5 }}>
                        Catalog Highlights
                    </Typography>

                    {items.slice(0, 5).map((item) => (
                        <SellerCard key={item.id} component={Link} href={route("seller.items.show", item.id)} sx={{ textDecoration: "none", color: "inherit" }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                                <Box>
                                    <Typography sx={{ fontWeight: 700 }}>{item.product_name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Starting at {sellerPrice(itemPrice(item))}
                                    </Typography>
                                </Box>
                                <Chip label="View" size="small" />
                            </Stack>
                        </SellerCard>
                    ))}
                </Stack>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
