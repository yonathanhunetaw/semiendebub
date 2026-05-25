import {
    SellerCard,
    SellerHeader,
    sellerHeaderButtonSx,
    sellerImage,
    sellerPrice,
} from "@/Components/Seller/sellerUi";

import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router, useForm } from "@inertiajs/react";

import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import BarcodeIcon from "@mui/icons-material/QrCode2";

import {
    Box,
    Chip,
    IconButton,
    InputBase,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";

import React from "react";

/* ================= TYPES ================= */

/* ================= TYPES ================= */

interface SellerItem {
    id: number;
    product_name: string;
    general_images?: string[] | string | null;
    processed_images?: string[];
    sold_count?: number | null;
    category?: {
        category_name?: string;
    } | null;

    // ✅ ADD THIS: Define the shape of your variants
    variants: Array<{
        storeVariants: Array<{
            pricing_matrix: {
                price: number | string;
                discount_price?: number | string | null;
            };
        }>;
    }>;

    store_price?: number | string;
    final_price?: number | string | null;
    store_stock?: number;
}

interface SellerItemFilters {
    search?: string;
    cart_id?: number | null;
}

const FALLBACK_IMAGE = "/images/defaults/no-image.png";

/* ================= COMPONENT ================= */

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

    const [loaded, setLoaded] = React.useState<Record<number, boolean>>({});

    const submit = (e: React.FormEvent) => {
        e.preventDefault();

        console.log("🔍 Seller search submit:", data.search);

        router.get(route("seller.items.index"), {
            search: data.search,
            cart_id: filters.cart_id || undefined,
        });
    };

    return (
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
            <Head title="Seller Items" />

            {/* ================= HEADER ================= */}
            <SellerHeader title="">
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
                                border: "1px solid rgba(255,255,255,0.44)",
                            }}
                        >
                            <SearchRoundedIcon sx={{ color: "#fff", mr: 1 }} />

                            <InputBase
                                fullWidth
                                placeholder="Search items"
                                value={data.search}
                                onChange={(e) => {
                                    console.log("⌨️ typing:", e.target.value);
                                    setData("search", e.target.value);
                                }}
                                sx={{ color: "#fff" }}
                            />
                        </Box>

                        <IconButton type="submit" sx={sellerHeaderButtonSx}>
                            <SearchRoundedIcon />
                        </IconButton>

                        {/* BARCODE ICON */}
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
                    {items.map((item) => {
                        console.log("ITEM DATA:", item); // Check console for store_price here
                        const firstVariant = item.variants?.[0];
                        const price = firstVariant?.storeVariants?.[0]?.pricing_matrix?.price;
                        const images =
                            item.processed_images?.length
                                ? item.processed_images
                                : Array.isArray(item.general_images)
                                    ? item.general_images
                                    : typeof item.general_images === "string"
                                        ? [item.general_images]
                                        : [];

                        const img = images?.[0] || FALLBACK_IMAGE;

                        console.log("🖼️ ITEM IMAGE DEBUG:", {
                            id: item.id,
                            processed: item.processed_images,
                            general: item.general_images,
                            final: img,
                        });

                        return (
                            <SellerCard
                                key={item.id}
                                component={Link}
                                href={route("seller.items.show", item.id)}
                                sx={{
                                    p: 0,
                                    overflow: "hidden",
                                }}
                            >
                                {/* ================= IMAGE ================= */}
                                <Box
                                    sx={{
                                        height: 140,
                                        position: "relative",
                                        background:
                                            theme.palette.mode === "dark"
                                                ? "rgba(255,255,255,0.02)"
                                                : "#f8fafc",
                                    }}
                                >
                                    {!loaded[item.id] && (
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

                                    <img
                                        src={img}
                                        alt={item.product_name}
                                        onLoad={() => {
                                            console.log("✅ image loaded:", item.id);
                                            setLoaded((p) => ({
                                                ...p,
                                                [item.id]: true,
                                            }));
                                        }}
                                        onError={(e) => {
                                            console.warn("⚠️ image failed:", img);

                                            (e.currentTarget as HTMLImageElement).src =
                                                FALLBACK_IMAGE;

                                            setLoaded((p) => ({
                                                ...p,
                                                [item.id]: true,
                                            }));
                                        }}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "contain",
                                            opacity: loaded[item.id] ? 1 : 0,
                                            transition: "opacity 0.3s ease",
                                        }}
                                    />
                                </Box>


                                {/* ================= CONTENT ================= */}
                                <Box sx={{ p: 1.5 }}>
                                    <Typography fontWeight={800} noWrap>
                                        {item.product_name}
                                    </Typography>

                                    {/* This displays the price extracted from the variants */}
                                    <Typography sx={{ mt: 1, fontWeight: 900, color: "primary.main" }}>
                                        {price ? `Ksh ${price}` : "Price N/A"}
                                    </Typography>

                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        sx={{ mt: 1 }}
                                    >
                                        <Typography variant="caption">
                                            {item.sold_count ?? 0} sold
                                        </Typography>

                                        {item.category?.category_name && (
                                            <Chip
                                                label={item.category.category_name}
                                                size="small"
                                                variant="outlined"
                                            />
                                        )}
                                    </Stack>
                                </Box>
                            </SellerCard>
                        );
                    })}
                </Box>
            </Box>

            {/* ================= SHIMMER ================= */}
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