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

import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import BarcodeIcon from "@mui/icons-material/QrCode2";

import {
    Box,
    Chip,
    IconButton,
    InputBase,
    Stack,
    Typography,
    useTheme,
    Avatar,
} from "@mui/material";

import React from "react";

/* =========================
   TYPES
========================= */

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
    pricing_matrix?: PackagingMatrixRow[] | null;
}

interface ItemVariant {
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

/* =========================
   HELPERS
========================= */

const FALLBACK_IMAGE = "/images/defaults/no-image.png";

function itemImage(item: SellerItem) {
    return sellerImage(item.general_images ?? null);
}

function variantStorePrices(variant: ItemVariant) {
    const storeVariants = variant.storeVariants ?? variant.store_variants ?? [];
    const prices: number[] = [];

    storeVariants.forEach((storeVariant) => {
        const matrix = storeVariant.pricing_matrix ?? [];
        matrix.forEach((row) => {
            const finalPrice = row.discount_price ?? row.price;
            if (finalPrice != null) prices.push(finalPrice);
        });
    });

    return prices;
}

function itemPrice(item: SellerItem) {
    const prices = (item.variants ?? []).flatMap(variantStorePrices);
    return prices.length ? Math.min(...prices) : null;
}

/* =========================
   COMPONENT
========================= */

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

    const theme = useTheme();

    const [loadedImages, setLoadedImages] = React.useState<Record<number, boolean>>({});

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

    const cardStyle = {
        bgcolor: "background.paper",
        color: "text.primary",
        border: "1px solid",
        borderColor: "divider",
        textDecoration: "none",
        "& .MuiTypography-root": { color: "text.primary" },
    };

    return (
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh", pb: 5 }}>
            <Head title="Seller Items" />

            {/* ================= HEADER ================= */}
            <SellerHeader title="">
                <Box component="form" onSubmit={submit} sx={{ mt: 1 }}>
                    <Stack direction="row" spacing={1}>
                        <Box
                            sx={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                px: 1.5,
                                borderRadius: 999,
                                backgroundColor: "rgba(255,255,255,0.14)",
                                border: "1px solid rgba(255,255,255,0.44)",
                                backdropFilter: "blur(8px)",
                            }}
                        >
                            <SearchRoundedIcon sx={{ color: "#fff", mr: 1 }} />
                            <InputBase
                                fullWidth
                                placeholder="Search items"
                                value={data.search}
                                onChange={(e) => setData("search", e.target.value)}
                                sx={{
                                    fontSize: 15,
                                    color: "#fff",
                                    "& input::placeholder": {
                                        color: "rgba(255,255,255,0.9)",
                                    },
                                }}
                            />
                        </Box>

                        <IconButton type="submit" sx={sellerHeaderButtonSx}>
                            <SearchRoundedIcon />
                        </IconButton>

                        {/* 🔥 QR → Barcode */}
                        <IconButton sx={sellerHeaderButtonSx}>
                            <BarcodeIcon />
                        </IconButton>
                    </Stack>
                </Box>
            </SellerHeader>

            {/* ================= GRID ================= */}
            <Box sx={{ px: 2, pt: 2 }}>
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
                                ...cardStyle,
                                p: 0,
                                overflow: "hidden",
                            }}
                        >
                            {/* ================= IMAGE ================= */}
                            <Box
                                sx={{
                                    height: 140,
                                    position: "relative",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor:
                                        theme.palette.mode === "dark"
                                            ? "rgba(255,255,255,0.02)"
                                            : "#f8fafc",
                                    overflow: "hidden",
                                }}
                            >
                                {/* Skeleton */}
                                {!loadedImages[item.id] && (
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            inset: 0,
                                            background:
                                                "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)",
                                            backgroundSize: "400% 100%",
                                            animation: "shimmer 1.2s infinite",
                                        }}
                                    />
                                )}

                                <Box
                                    component="img"
                                    src={itemImage(item) || FALLBACK_IMAGE}
                                    alt={item.product_name}
                                    onLoad={() =>
                                        setLoadedImages((prev) => ({
                                            ...prev,
                                            [item.id]: true,
                                        }))
                                    }
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src =
                                            FALLBACK_IMAGE;
                                        setLoadedImages((prev) => ({
                                            ...prev,
                                            [item.id]: true,
                                        }));
                                    }}
                                    sx={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                        opacity: loadedImages[item.id] ? 1 : 0,
                                        transition: "opacity 0.25s ease-in-out",
                                    }}
                                />
                            </Box>

                            {/* ================= CONTENT ================= */}
                            <Box sx={{ p: 1.5 }}>
                                <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="center"
                                >
                                    <Typography sx={{ fontWeight: 800 }} noWrap>
                                        {item.product_name}
                                    </Typography>

                                    <Chip
                                        label="NEW"
                                        size="small"
                                        sx={{
                                            bgcolor: "primary.main",
                                            color:
                                                theme.palette.mode === "dark"
                                                    ? "#000"
                                                    : "#fff",
                                            fontWeight: 900,
                                        }}
                                    />
                                </Stack>

                                <Typography
                                    sx={{
                                        mt: 1,
                                        fontWeight: 900,
                                        color: "primary.main",
                                    }}
                                >
                                    {itemPrice(item) !== null
                                        ? sellerPrice(itemPrice(item))
                                        : "N/A"}
                                </Typography>

                                <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    sx={{ mt: 1 }}
                                >
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: "text.secondary",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {item.sold_count ?? 0} sold
                                    </Typography>

                                    {item.category?.category_name && (
                                        <Chip
                                            label={item.category.category_name}
                                            size="small"
                                            variant="outlined"
                                            sx={{
                                                color: "text.secondary",
                                                borderColor: "divider",
                                                height: 20,
                                                fontSize: "0.65rem",
                                            }}
                                        />
                                    )}
                                </Stack>
                            </Box>
                        </SellerCard>
                    ))}
                </Box>
            </Box>

            {/* ================= SHIMMER KEYFRAME ================= */}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
            `}</style>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;