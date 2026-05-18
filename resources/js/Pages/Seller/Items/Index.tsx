import {
    SELLER_BRAND_DARK,
    SellerCard,
    SellerHeader,
    sellerHeaderButtonSx,
    sellerImage,
    sellerPrice,
} from "@/Components/Seller/sellerUi";
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

// 🎯 UPDATED: Define internal properties reflecting your role packaging rows
interface PackagingMatrixRow {
    packaging_type_id: number;
    unit_name: string;
    multiplier: number;
    price: number;
    discount_price: number | null;
    discount_ends_at: string | null;
    image: string | null;
}

interface StoreVariant {
    id: number;
    store_id: number;
    item_variant_id: number;
    // 🎯 UPDATED: Flat prices removed, replaced with parsed matrix array properties
    pricing_matrix?: PackagingMatrixRow[] | null;
    active: boolean;
}

interface ItemVariant {
    id: number;
    sku: string;
    store_variants?: StoreVariant[];
    storeVariants?: StoreVariant[];
}

interface SellerItem {
    id: number;
    product_name: string;
    general_images?: string[] | string | null;
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
    return sellerImage(item.general_images ?? null);
}

// 🎯 UPDATED: Extract pricing safely from inside your JSON Matrix arrays
function variantStorePrices(variant: ItemVariant) {
    const storeVariants = variant.storeVariants ?? variant.store_variants ?? [];
    const absolutePrices: number[] = [];

    storeVariants.forEach((storeVariant) => {
        const matrix = storeVariant.pricing_matrix ?? [];
        matrix.forEach((row) => {
            const finalPrice = row.discount_price ?? row.price;
            if (finalPrice != null) {
                absolutePrices.push(finalPrice);
            }
        });
    });

    return absolutePrices;
}

// 🎯 UPDATED: Calculates the baseline floor price across any packaging variations
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
    
    // 🎯 DESIGN REQUIREMENT FIX: 
    // If you want items to show immediately on mount before typing, 
    // change this to: const hasSearch = true;
    const hasSearch = data.search.trim() !== "" || items.length > 0;

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
                                backgroundColor: "rgba(255,255,255,0.14)",
                                color: "#fff",
                                border: "1px solid rgba(255,255,255,0.44)",
                                backdropFilter: "blur(8px)",
                            }}
                        >
                            <SearchRoundedIcon sx={{ color: "#fff", mr: 1 }} />
                            <InputBase
                                fullWidth
                                placeholder="Search items"
                                value={data.search}
                                onChange={(event) => setData("search", event.target.value)}
                                sx={{
                                    fontSize: 15,
                                    color: "#fff",
                                    "& input::placeholder": {
                                        color: "rgba(255,255,255,0.9)",
                                        opacity: 1,
                                    },
                                }}
                            />
                        </Box>
                        <IconButton type="submit" sx={sellerHeaderButtonSx}>
                            <SearchRoundedIcon />
                        </IconButton>
                        <IconButton sx={sellerHeaderButtonSx}>
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

                {!hasSearch ? (
                    <SellerCard sx={{ textAlign: "center", py: 4 }}>
                        <Typography sx={{ fontWeight: 700 }}>Search for an item to see results.</Typography>
                    </SellerCard>
                ) : items.length === 0 ? (
                    <SellerCard sx={{ textAlign: "center", py: 4 }}>
                        <Typography sx={{ fontWeight: 700 }}>No items found.</Typography>
                    </SellerCard>
                ) : (
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

                                    {/* 🎯 Displays the lowest baseline entry pricing option cleanly */}
                                    <Typography sx={{ mt: 1, fontWeight: 800, color: "error.main" }}>
                                        {itemPrice(item) !== null ? sellerPrice(itemPrice(item)) : "N/A"}
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
                )}
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;