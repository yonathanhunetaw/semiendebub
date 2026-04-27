import { SELLER_BRAND_DARK, SellerCard, SellerHeader, sellerImage, sellerPrice } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router, useForm } from "@inertiajs/react";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Box,
    Chip,
    IconButton,
    InputBase,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

interface StoreVariant {
    price?: number | null;
    discount_price?: number | null;
}

interface ItemVariant {
    price?: number | null;
    store_variants?: StoreVariant[];
    storeVariants?: StoreVariant[];
}

interface SellerItem {
    id: number;
    product_name: string;
    product_images?: string[] | string | null;
    sold_count?: number | null;
    category?: {
        category_name?: string;
    } | null;
    variants?: ItemVariant[];
}

interface SellerItemFilters {
    search?: string;
    cart_id?: number | null;
}

function itemImage(item: SellerItem) {
    if (Array.isArray(item.product_images)) {
        return sellerImage(item.product_images[0] ?? null);
    }

    return sellerImage(item.product_images ?? null);
}

function variantStorePrices(variant: ItemVariant) {
    const storeVariants = variant.storeVariants ?? variant.store_variants ?? [];
    const prices = storeVariants
        .map((storeVariant) => storeVariant.discount_price ?? storeVariant.price)
        .filter((price): price is number => price != null);

    return prices.length ? prices : [variant.price].filter((price): price is number => price != null);
}

function itemPrice(item: SellerItem) {
    const prices = (item.variants ?? []).flatMap(variantStorePrices);

    return prices.length ? Math.min(...prices) : null;
}

export default function Index({
    items = [],
    filters = {},
}: {
    items?: SellerItem[];
    filters?: SellerItemFilters;
}) {
    const { data, setData } = useForm({
        search: filters.search ?? "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        router.get(
            route("seller.items.index"),
            {
                search: data.search,
                cart_id: filters.cart_id || undefined,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            },
        );
    };

    return (
        <>
            <Head title="Seller Catalog" />

            <SellerHeader title="Catalog">
                <Box component="form" onSubmit={submit}>
                    <Stack direction="row" spacing={1}>
                        <Box
                            sx={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                px: 1.5,
                                borderRadius: 999,
                                backgroundColor: "rgba(255,255,255,0.94)",
                                color: "text.primary",
                            }}
                        >
                            <SearchRoundedIcon sx={{ color: "text.secondary", mr: 1 }} />
                            <InputBase
                                fullWidth
                                placeholder="Search items"
                                value={data.search}
                                onChange={(event) => setData("search", event.target.value)}
                                sx={{ fontSize: 15 }}
                            />
                        </Box>
                        <IconButton
                            type="submit"
                            sx={{
                                width: 44,
                                height: 44,
                                color: "#fff",
                                border: "1px solid rgba(255,255,255,0.44)",
                                backgroundColor: "rgba(255,255,255,0.14)",
                            }}
                        >
                            <SearchRoundedIcon />
                        </IconButton>
                        <IconButton
                            sx={{
                                width: 44,
                                height: 44,
                                color: "#fff",
                                border: "1px solid rgba(255,255,255,0.44)",
                                backgroundColor: "rgba(255,255,255,0.14)",
                            }}
                        >
                            <QrCodeScannerRoundedIcon />
                        </IconButton>
                    </Stack>
                </Box>
            </SellerHeader>

            <Box sx={{ px: 2, pt: 2 }}>
                {filters.cart_id ? (
                    <Chip
                        component={Link}
                        href={route("seller.carts.show", filters.cart_id)}
                        clickable
                        label={`Adding into Cart #${filters.cart_id}`}
                        sx={{ mb: 2, bgcolor: "#fff7ed", color: SELLER_BRAND_DARK, fontWeight: 700 }}
                    />
                ) : null}

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 1.5,
                    }}
                >
                    {items.map((item) => (
                        <SellerCard
                            key={item.id}
                            component={Link}
                            href={route("seller.items.show", {
                                item: item.id,
                                cart_id: filters.cart_id || undefined,
                            })}
                            sx={{
                                p: 0,
                                overflow: "hidden",
                                textDecoration: "none",
                                color: "inherit",
                            }}
                        >
                            <Box
                                sx={{
                                    height: 140,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: "#fff7ed",
                                }}
                            >
                                {itemImage(item) ? (
                                    <Box
                                        component="img"
                                        src={itemImage(item)!}
                                        alt={item.product_name}
                                        sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                                    />
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        No image
                                    </Typography>
                                )}
                            </Box>

                            <Box sx={{ p: 1.5 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                    <Typography sx={{ fontWeight: 700 }} noWrap>
                                        {item.product_name}
                                    </Typography>
                                    <Chip label="NEW" size="small" color="warning" />
                                </Stack>

                                <Typography sx={{ mt: 1, fontWeight: 800, color: "error.main" }}>
                                    {sellerPrice(itemPrice(item))}
                                </Typography>

                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {item.sold_count ?? 0} sold
                                    </Typography>
                                    {item.category?.category_name ? (
                                        <Chip label={item.category.category_name} size="small" variant="outlined" />
                                    ) : null}
                                </Stack>
                            </Box>
                        </SellerCard>
                    ))}
                </Box>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
