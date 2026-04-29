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
    useTheme
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
    const theme = useTheme();

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

    // Shared style for cards and inputs to adapt to theme
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
            <Head title="Seller Catalog" />

            <SellerHeader title="Catalog">
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
                        sx={{
                            mb: 2,
                            bgcolor: "primary.main",
                            color: theme.palette.mode === 'dark' ? "#000" : "#fff",
                            fontWeight: 800,
                            borderRadius: 2
                        }}
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
                                ...cardStyle,
                                p: 0,
                                overflow: "hidden",
                            }}
                        >
                            <Box
                                sx={{
                                    height: 140,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: theme.palette.mode === 'dark' ? "rgba(255,255,255,0.02)" : "#f8fafc",
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
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                        No image
                                    </Typography>
                                )}
                            </Box>

                            <Box sx={{ p: 1.5 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                    <Typography sx={{ fontWeight: 800 }} noWrap>
                                        {item.product_name}
                                    </Typography>
                                    <Chip
                                        label="NEW"
                                        size="small"
                                        sx={{
                                            bgcolor: "primary.main",
                                            color: theme.palette.mode === 'dark' ? "#000" : "#fff",
                                            fontWeight: 900,
                                            height: 18,
                                            fontSize: '0.6rem'
                                        }}
                                    />
                                </Stack>

                                <Typography sx={{ mt: 1, fontWeight: 900, color: "primary.main" }}>
                                    {sellerPrice(itemPrice(item))}
                                </Typography>

                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                                        {item.sold_count ?? 0} sold
                                    </Typography>
                                    {item.category?.category_name && (
                                        <Chip
                                            label={item.category.category_name}
                                            size="small"
                                            variant="outlined"
                                            sx={{ color: 'text.secondary', borderColor: 'divider', height: 20, fontSize: '0.65rem' }}
                                        />
                                    )}
                                </Stack>
                            </Box>
                        </SellerCard>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
