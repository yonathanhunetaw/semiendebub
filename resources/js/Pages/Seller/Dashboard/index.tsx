import {
    SellerCard,
    SellerHeader,
    sellerHeaderButtonSx,
    sellerImage,
    sellerPrice,
    SELLER_BRAND_DARK,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router, useForm } from "@inertiajs/react";

import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import {
    Box,
    Chip,
    IconButton,
    InputBase,
    Stack,
    Typography,
    useTheme,
    CircularProgress,
    Tooltip,
} from "@mui/material";

import React from "react";

/* ================= TYPES ================= */

interface SellerItem {
    id: number;
    product_name: string;
    image_urls?: string[];
    general_images?: string[] | string | null;
    processed_images?: string[];
    sold_count?: number | null;
    category?: {
        category_name?: string;
    } | null;
    variants: Array<{
        storeVariants: Array<{
            pricing_matrix: any;
        }>;
    }>;
    store_price?: number | string;
    final_price?: number | string | null;
    store_stock?: number;
    discount_ends_at?: string | null;
    original_price?: number | string | null;
    pricing_matrix?: {
        price: number;
        discount_price: number | null;
        discount_ends_at: string | null;
    };
}

interface SellerItemFilters {
    search?: string;
    cart_id?: number | null;
    page?: number;
}

// Custom Barcode Icon SVG
const BarcodeIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="6" width="2" height="12" fill="currentColor"/>
        <rect x="7" y="6" width="1" height="12" fill="currentColor"/>
        <rect x="9" y="6" width="3" height="12" fill="currentColor"/>
        <rect x="13" y="6" width="1" height="12" fill="currentColor"/>
        <rect x="15" y="6" width="2" height="12" fill="currentColor"/>
        <rect x="18" y="6" width="2" height="12" fill="currentColor"/>
        <rect x="21" y="6" width="1" height="12" fill="currentColor"/>
    </svg>
);

// SVG placeholder with camera/photo icon
const NO_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f5f5f5'/%3E%3Cpath d='M160 160 L240 160 M200 120 L200 200' stroke='%23999' stroke-width='8' fill='none'/%3E%3Ccircle cx='200' cy='200' r='80' fill='none' stroke='%23999' stroke-width='8'/%3E%3C/svg%3E";

// Helper function to convert price to number
const toNumber = (value: string | number | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
};

// Countdown Timer Component
function DiscountCountdown({ endsAt }: { endsAt: string | null }) {
    const [timeLeft, setTimeLeft] = React.useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
    const [isExpired, setIsExpired] = React.useState(false);

    React.useEffect(() => {
        if (!endsAt) return;

        const calculateTimeLeft = () => {
            const now = new Date().getTime();
            const endDate = new Date(endsAt).getTime();
            const difference = endDate - now;

            if (difference <= 0) {
                setIsExpired(true);
                return null;
            }

            return {
                days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((difference % (1000 * 60)) / 1000),
            };
        };

        const updateTimer = () => {
            const newTimeLeft = calculateTimeLeft();
            setTimeLeft(newTimeLeft);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [endsAt]);

    if (isExpired || !endsAt || !timeLeft) return null;

    const { days, hours, minutes, seconds } = timeLeft;

    let timeString = "";
    if (days > 0) timeString = `${days}d ${hours}h`;
    else if (hours > 0) timeString = `${hours}h ${minutes}m`;
    else if (minutes > 0) timeString = `${minutes}m ${seconds}s`;
    else timeString = `${seconds}s`;

    return (
        <Tooltip title={`Discount ends on ${new Date(endsAt).toLocaleString()}`}>
            <Chip
                icon={<AccessTimeIcon sx={{ fontSize: 12 }} />}
                label={timeString}
                size="small"
                sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    bgcolor: "#EAB308",
                    color: "#fff",
                    "& .MuiChip-icon": { color: "#fff", fontSize: 12, marginLeft: 0.5 },
                }}
            />
        </Tooltip>
    );
}

/* ================= COMPONENT ================= */

export default function Index({
    items: initialItems = [],
    filters = {},
    nextPageUrl = null,
}: {
    items?: SellerItem[];
    filters?: SellerItemFilters;
    nextPageUrl?: string | null;
}) {
    const { data, setData } = useForm({
        search: filters.search ?? "",
    });

    const theme = useTheme();
    const [loaded, setLoaded] = React.useState<Record<number, boolean>>({});
    const [items, setItems] = React.useState<SellerItem[]>(() => initialItems);
    const [hasNextPage, setHasNextPage] = React.useState<boolean>(!!nextPageUrl);
    const [isLoading, setIsLoading] = React.useState<boolean>(false);
    const [page, setPage] = React.useState<number>(2);
    const observerRef = React.useRef<HTMLDivElement | null>(null);

    // Debug: Log initial items
    React.useEffect(() => {
        console.log("🔍 Initial items received:", initialItems.length);
        if (initialItems.length > 0) {
            console.log("📦 First item sample:", {
                id: initialItems[0].id,
                name: initialItems[0].product_name,
                store_price: initialItems[0].store_price,
                original_price: initialItems[0].original_price,
                discount_ends_at: initialItems[0].discount_ends_at,
                pricing_matrix: initialItems[0].pricing_matrix,
            });
        }
    }, [initialItems]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setItems([]);
        setPage(2);
        setHasNextPage(true);
        
        router.get(route("seller.items.index"), {
            search: data.search,
            cart_id: filters.cart_id || undefined,
            page: 1,
        }, {
            preserveState: true,
            preserveScroll: true,
            onSuccess: (response: any) => {
                const newItems = response.props.items || [];
                const newNextPageUrl = response.props.nextPageUrl;
                console.log("📦 Search response items:", newItems.length);
                setItems(newItems);
                setHasNextPage(!!newNextPageUrl);
                setPage(2);
            },
        });
    };

    const loadMore = () => {
        if (isLoading || !hasNextPage) return;
        
        setIsLoading(true);
        
        router.get(route("seller.items.index"), {
            search: data.search,
            cart_id: filters.cart_id || undefined,
            page: page,
        }, {
            preserveState: true,
            preserveScroll: true,
            only: ['items', 'nextPageUrl'],
            onSuccess: (response: any) => {
                const newItems = response.props.items || [];
                const newNextPageUrl = response.props.nextPageUrl;
                
                console.log("📦 Loaded more items:", newItems.length);
                setItems(prev => [...prev, ...newItems]);
                setHasNextPage(!!newNextPageUrl);
                setPage(prev => prev + 1);
                setIsLoading(false);
            },
            onError: () => {
                setIsLoading(false);
            },
        });
    };

    React.useEffect(() => {
        if (!observerRef.current) return;
        
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isLoading) {
                    loadMore();
                }
            },
            { threshold: 0.1, rootMargin: "100px" }
        );
        
        observer.observe(observerRef.current);
        
        return () => {
            if (observerRef.current) {
                observer.unobserve(observerRef.current);
            }
        };
    }, [hasNextPage, isLoading, items.length]);

    React.useEffect(() => {
        setItems(initialItems);
    }, [initialItems]);

    return (
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
            <Head title="Seller Items" />

            {/* ================= SEARCH HEADER ================= */}
            <Box sx={{ px: 2, pt: 1, pb: 2 }}>
                <Box component="form" onSubmit={submit} sx={{ width: "100%" }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                            sx={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 999,
                                backgroundColor: theme.palette.mode === "dark" 
                                    ? "rgba(255,255,255,0.1)" 
                                    : "#f5f5f5",
                                border: "1px solid",
                                borderColor: theme.palette.mode === "dark" 
                                    ? "rgba(255,255,255,0.2)" 
                                    : "rgba(0,0,0,0.1)",
                            }}
                        >
                            <SearchRoundedIcon sx={{ color: "text.secondary", mr: 1 }} />
                            <InputBase
                                fullWidth
                                placeholder="Search items"
                                value={data.search}
                                onChange={(e) => setData("search", e.target.value)}
                                sx={{ color: "text.primary" }}
                            />
                        </Box>
                        <IconButton 
                            type="submit" 
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 2,
                                bgcolor: SELLER_BRAND_DARK,
                                color: "#fff",
                                "&:hover": { bgcolor: SELLER_BRAND_DARK, opacity: 0.9 },
                            }}
                        >
                            <SearchRoundedIcon />
                        </IconButton>
                        <IconButton 
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 2,
                                border: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            <BarcodeIcon />
                        </IconButton>
                    </Stack>
                </Box>
            </Box>

            {/* ================= GRID ================= */}
            <Box sx={{ px: 2 }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 1.5,
                        [theme.breakpoints.up("sm")]: {
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        },
                        [theme.breakpoints.up("md")]: {
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        },
                        [theme.breakpoints.up("lg")]: {
                            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                        },
                    }}
                >
                    {items.map((item) => {
                        // ✅ Convert all prices to numbers safely
                        const originalPriceNum = toNumber(item.original_price || item.store_price);
                        const discountPriceNum = toNumber(item.pricing_matrix?.discount_price);
                        const discountEndsAt = item.discount_ends_at;
                        
                        // Check if discount exists and is valid
                        const hasDiscount = discountPriceNum > 0 && discountPriceNum < originalPriceNum;
                        const displayPrice = hasDiscount ? discountPriceNum : originalPriceNum;
                        const discountPercent = hasDiscount && originalPriceNum > 0 
                            ? Math.round(((originalPriceNum - discountPriceNum) / originalPriceNum) * 100) 
                            : 0;
                        
                        // Debug log for each item
                        console.log(`💰 Price debug for ${item.product_name}:`, {
                            originalPriceNum,
                            discountPriceNum,
                            discountEndsAt,
                            hasDiscount,
                            displayPrice,
                            discountPercent,
                            pricing_matrix: item.pricing_matrix,
                        });

                        const images = item.image_urls || [];
                        const img = images?.[0] || NO_IMAGE_PLACEHOLDER;

                        return (
                            <SellerCard
                                key={item.id}
                                component={Link}
                                href={route("seller.items.show", item.id)}
                                sx={{
                                    p: 0,
                                    overflow: "hidden",
                                    cursor: "pointer",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                    "&:hover": {
                                        transform: "translateY(-4px)",
                                        boxShadow: theme.shadows[8],
                                    },
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
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
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
                                            setLoaded((p) => ({
                                                ...p,
                                                [item.id]: true,
                                            }));
                                        }}
                                        onError={(e) => {
                                            const target = e.currentTarget as HTMLImageElement;
                                            if (target.src.includes(NO_IMAGE_PLACEHOLDER)) {
                                                return;
                                            }
                                            target.src = NO_IMAGE_PLACEHOLDER;
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
                                    <Typography 
                                        fontWeight={800} 
                                        noWrap
                                        sx={{
                                            fontSize: "0.85rem",
                                            [theme.breakpoints.up("sm")]: {
                                                fontSize: "0.95rem",
                                            },
                                        }}
                                    >
                                        {item.product_name}
                                    </Typography>

                                    {/* ================= PRICE WITH DISCOUNT AND COUNTDOWN ================= */}
                                    <Box sx={{ mt: 1 }}>
                                        <Stack direction="row" alignItems="baseline" flexWrap="wrap" spacing={0.5}>
                                            <Typography
                                                fontWeight={900}
                                                sx={{ 
                                                    color: hasDiscount ? "error.main" : "text.primary",
                                                    fontSize: "0.95rem",
                                                    [theme.breakpoints.up("sm")]: {
                                                        fontSize: "1.1rem",
                                                    },
                                                }}
                                            >
                                                {displayPrice > 0 ? `${displayPrice.toFixed(2)} Birr` : "Price N/A"}
                                            </Typography>
                                            
                                            {hasDiscount && originalPriceNum > 0 && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        textDecoration: "line-through",
                                                        color: "text.disabled",
                                                        fontSize: "0.7rem",
                                                    }}
                                                >
                                                    {originalPriceNum.toFixed(2)} Birr
                                                </Typography>
                                            )}
                                        </Stack>
                                        
                                        {/* Discount badge and countdown */}
                                        {hasDiscount && discountEndsAt && discountPercent > 0 && (
                                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
                                                <Chip
                                                    label={`-${discountPercent}% OFF`}
                                                    size="small"
                                                    sx={{ 
                                                        bgcolor: "#EAB308", 
                                                        color: "#fff", 
                                                        fontWeight: 700, 
                                                        fontSize: "0.65rem",
                                                        height: 20,
                                                    }}
                                                />
                                                <DiscountCountdown endsAt={discountEndsAt} />
                                            </Stack>
                                        )}
                                    </Box>

                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        sx={{ mt: 1 }}
                                    >
                                        <Typography variant="caption" color="text.secondary">
                                            {item.sold_count ?? 0} sold
                                        </Typography>

                                        {item.category?.category_name && (
                                            <Chip
                                                label={item.category.category_name}
                                                size="small"
                                                variant="outlined"
                                                sx={{ height: 20, fontSize: "0.65rem" }}
                                            />
                                        )}
                                    </Stack>
                                </Box>
                            </SellerCard>
                        );
                    })}
                </Box>

                {/* Loading indicator */}
                {isLoading && (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                        <CircularProgress size={40} />
                    </Box>
                )}

                {/* End of content message */}
                {!hasNextPage && items.length > 0 && (
                    <Typography 
                        textAlign="center" 
                        color="text.secondary" 
                        sx={{ py: 4 }}
                    >
                        You've reached the end
                    </Typography>
                )}

                {/* Empty state */}
                {items.length === 0 && !isLoading && (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            py: 8,
                        }}
                    >
                        <ImageNotSupportedIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
                        <Typography color="text.secondary" align="center">
                            No items found
                        </Typography>
                        {data.search && (
                            <IconButton
                                onClick={() => {
                                    setData("search", "");
                                    router.get(route("seller.items.index"), {
                                        cart_id: filters.cart_id || undefined,
                                    });
                                }}
                                sx={{ mt: 2 }}
                            >
                                Clear search
                            </IconButton>
                        )}
                    </Box>
                )}

                {/* Observer trigger for infinite scroll */}
                {hasNextPage && items.length > 0 && (
                    <div ref={observerRef} style={{ height: "20px" }} />
                )}
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