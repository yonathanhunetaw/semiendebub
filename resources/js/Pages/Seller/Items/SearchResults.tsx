import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Typography,
    CircularProgress,
    IconButton,
    Stack,
    Chip,
    useTheme,
    Tooltip,
    InputBase,
    Paper,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { SellerCard, sellerShadow } from "@/Components/Seller/sellerUi";
import StockCaption from "@/Components/Seller/StockCaption";

// ======================== SVG PLACEHOLDER ========================
const NO_IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f5f5f5'/%3E%3Cpath d='M160 160 L240 160 M200 120 L200 200' stroke='%23999' stroke-width='8' fill='none'/%3E%3Ccircle cx='200' cy='200' r='80' fill='none' stroke='%23999' stroke-width='8'/%3E%3C/svg%3E";

// ======================== TYPES ========================
interface SearchResultItem {
    id: number;
    product_name: string;
    image_urls: string[];
    original_price: number;
    store_price?: number | null;
    final_price: number | null;
    discount_ends_at: string | null;
    store_stock: number;
    sold_count: number;
    category: { category_name: string } | null;
    pricing_matrix?: Array<{
        level: string;
        price: number;
        discount_price: number | null;
        discount_ends_at: string | null;
        final: number;
    }>;
}

interface Props {
    query: string;
    items: SearchResultItem[];
    nextPageUrl: string | null;
    categories?: { id: number; category_name: string }[];
    selectedCategoryId?: number | null;
    has_tin_cart?: boolean;
}

// ======================== IMAGE RESOLVER ========================
const resolveImageUrl = (path?: string): string => {
    if (!path) return NO_IMAGE_PLACEHOLDER;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const baseUrl = import.meta.env.VITE_AWS_URL || "http://duka.test:9000/duka-images";
    return `${baseUrl}/${path.replace(/^\//, "")}`;
};

// ======================== DISCOUNT COUNTDOWN (full‑width version) ========================
function DiscountCountdown({ endsAt }: { endsAt: string | null }) {
    const [timeLeft, setTimeLeft] = React.useState<{
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
    } | null>(null);
    const [isExpired, setIsExpired] = React.useState(false);

    React.useEffect(() => {
        if (!endsAt) return;
        const calculate = () => {
            const diff = new Date(endsAt).getTime() - Date.now();
            if (diff <= 0) {
                setIsExpired(true);
                return null;
            }
            return {
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % 86400000) / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
                seconds: Math.floor((diff % 60000) / 1000),
            };
        };
        const update = () => setTimeLeft(calculate());
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [endsAt]);

    if (isExpired || !endsAt || !timeLeft) return null;
    const { days, hours, minutes, seconds } = timeLeft;
    let label = "";
    if (days > 0) label = `${days}d ${hours}h`;
    else if (hours > 0) label = `${hours}h ${minutes}m`;
    else if (minutes > 0) label = `${minutes}m ${seconds}s`;
    else label = `${seconds}s`;

    return (
        <Tooltip title={`Discount ends on ${new Date(endsAt).toLocaleString()}`}>
            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                <AccessTimeIcon sx={{ fontSize: 16, color: "rgb(var(--inverse-on-surface))" }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "rgb(var(--inverse-on-surface))", fontSize: "0.75rem" }}>
                    {label}
                </Typography>
            </Stack>
        </Tooltip>
    );
}

// ======================== MAIN SEARCH RESULTS ========================
export default function SearchResults({
    query,
    items: initialItems,
    nextPageUrl,
    categories = [],
    selectedCategoryId = null,
    has_tin_cart = false,
}: Props) {
    const theme = useTheme();
    const [items, setItems] = React.useState(initialItems);
    const [hasNextPage, setHasNextPage] = React.useState(!!nextPageUrl);
    const [isLoading, setIsLoading] = React.useState(false);
    const [page, setPage] = React.useState(2);
    const observerRef = React.useRef<HTMLDivElement | null>(null);
    const [loaded, setLoaded] = React.useState<Record<number, boolean>>({});
    const [searchInput, setSearchInput] = React.useState(query || "");
    const [categoriesExpanded, setCategoriesExpanded] = React.useState(false);
    const isScrollingRef = React.useRef(false);

    React.useEffect(() => {
        if (isScrollingRef.current) {
            isScrollingRef.current = false;
            return;
        }
        setItems(initialItems);
        setHasNextPage(!!nextPageUrl);
        setPage(2);
    }, [initialItems, nextPageUrl]);

    // ========== INFINITE SCROLL ==========
    const loadMore = () => {
        if (isLoading || !hasNextPage) return;
        setIsLoading(true);
        isScrollingRef.current = true;
        router.get(
            route("seller.items.search"),
            { search: searchInput, category_id: selectedCategoryId || undefined, page },
            {
                preserveState: true,
                preserveScroll: true,
                only: ["items", "nextPageUrl"],
                onSuccess: (resp: any) => {
                    setItems((prev) => [...prev, ...(resp.props.items || [])]);
                    setHasNextPage(!!resp.props.nextPageUrl);
                    setPage((p) => p + 1);
                    setIsLoading(false);
                },
                onError: () => {
                    isScrollingRef.current = false;
                    setIsLoading(false);
                },
            }
        );
    };

    React.useEffect(() => {
        if (!observerRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isLoading) loadMore();
            },
            { threshold: 0.1, rootMargin: "100px" }
        );
        observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isLoading]);

    // ========== SEARCH & CATEGORY HANDLERS ==========
    const handleCategorySelect = (categoryId: number | null) => {
        router.get(route("seller.items.search"), {
            search: searchInput,
            category_id: categoryId || undefined,
        });
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        router.get(route("seller.items.search"), {
            search: searchInput,
            category_id: selectedCategoryId || undefined,
        });
    };

    // ========== RENDER ==========
    return (
        <SellerLayout>
            <Head title={`Search: ${query || "All Items"}`} />
            <Box sx={{ bgcolor: "background.default", minHeight: "100vh", pb: 10 }}>
                {/* ========== SEARCH HEADER (matches Index) ========== */}
                <Box sx={{ px: { xs: 2, md: 4 }, pt: 2, pb: 2, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                        <IconButton component={Link} href={route("seller.dashboard")} sx={{ color: "text.secondary" }}>
                            <ArrowBackRoundedIcon />
                        </IconButton>
                        <Box
                            component="form"
                            onSubmit={handleSearchSubmit}
                            sx={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                px: 2,
                                py: 1,
                                borderRadius: 999,
                                bgcolor: "rgb(var(--surface-container))",
                                border: "1px solid",
                                borderColor: "divider",
                                transition: "border-color 0.2s, background 0.2s",
                                "&:focus-within": { borderColor: "primary.main", bgcolor: "background.paper" },
                            }}
                        >
                            <SearchRoundedIcon sx={{ color: "text.secondary", mr: 1 }} />
                            <InputBase
                                fullWidth
                                autoFocus
                                placeholder="Search items..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                sx={{ fontSize: "0.95rem" }}
                            />
                        </Box>
                        <IconButton
                            type="submit"
                            onClick={handleSearchSubmit}
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: 999,
                                bgcolor: "primary.main",
                                color: "primary.contrastText",
                                "&:hover": { bgcolor: "rgb(var(--primary) / 0.9)" },
                            }}
                        >
                            <SearchRoundedIcon />
                        </IconButton>
                    </Stack>
                </Box>

                {/* ========== MAIN CONTENT ========== */}
                <Box sx={{ px: { xs: 2, md: 4 }, pt: 3 }}>
                    {/* ========== CATEGORY FILTER ========== */}
                    {categories.length > 0 && (
                        <Box sx={{ mb: 3 }}>
                            <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                                onClick={() => setCategoriesExpanded(!categoriesExpanded)}
                                sx={{ cursor: "pointer", py: 1, borderBottom: "1px solid", borderColor: "divider", mb: 1 }}
                            >
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="body2" fontWeight="bold" color="text.secondary">
                                        Filter by Category
                                    </Typography>
                                    {selectedCategoryId !== null && !categoriesExpanded && (
                                        <Chip
                                            size="small"
                                            color="primary"
                                            label={categories.find((c) => c.id === selectedCategoryId)?.category_name || "Filtered"}
                                        />
                                    )}
                                </Stack>
                                <IconButton size="small">
                                    {categoriesExpanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                                </IconButton>
                            </Stack>

                            {categoriesExpanded && (
                                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", pt: 1 }}>
                                    <Chip
                                        label="All"
                                        clickable
                                        color={selectedCategoryId === null ? "primary" : "default"}
                                        onClick={() => handleCategorySelect(null)}
                                        sx={{ fontWeight: "bold" }}
                                    />
                                    {categories.map((cat) => (
                                        <Chip
                                            key={cat.id}
                                            label={cat.category_name}
                                            clickable
                                            color={selectedCategoryId === cat.id ? "primary" : "default"}
                                            onClick={() => handleCategorySelect(cat.id)}
                                            sx={{ fontWeight: "bold" }}
                                        />
                                    ))}
                                </Box>
                            )}
                        </Box>
                    )}

                    {/* ========== PRODUCT GRID (matching Index) ========== */}
                    <Box
                        sx={{
                            display: "grid",
                            gap: 3,
                            gridTemplateColumns: {
                                xs: "repeat(2, 1fr)",
                                sm: "repeat(3, 1fr)",
                                md: "repeat(4, 1fr)",
                            },
                            width: "100%",
                        }}
                    >
                        {items.map((item) => {
                            // The backend (search controller) already resolved everything:
                            // Individual carts, Business VAT, Customer prices, and Seller prices.
                            const originalPrice = item.store_price ?? item.original_price ?? 0;
                            const displayPrice = item.final_price ?? originalPrice;
                            
                            const deepestTier = item.pricing_matrix?.[item.pricing_matrix.length - 1];
                            const discountEnds = deepestTier?.discount_ends_at ?? item.discount_ends_at ?? null;
                            const isSellerPrice = deepestTier?.level === "seller";
                            
                            const hasDiscount = displayPrice < originalPrice;
                            const discountPercent =
                                hasDiscount && originalPrice > 0
                                    ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
                                    : 0;

                            const imgSrc = item.image_urls?.[0]
                                ? resolveImageUrl(item.image_urls[0])
                                : NO_IMAGE_PLACEHOLDER;

                            return (
                                <SellerCard
                                    key={item.id}
                                    component={Link}
                                    href={route("seller.items.show", item.id)}
                                    sx={{
                                        p: 0,
                                        overflow: "hidden",
                                        borderRadius: 3,
                                        bgcolor: "background.paper",
                                        border: "1px solid rgb(var(--outline-variant) / 0.6)",
                                        boxShadow: sellerShadow("0 2px 8px", 0.04),
                                        transition: "transform 0.2s, box-shadow 0.2s",
                                        "&:hover": {
                                            transform: "translateY(-4px)",
                                            boxShadow: sellerShadow("0 8px 24px", 0.08),
                                        },
                                        cursor: "pointer",
                                        textDecoration: "none",
                                    }}
                                >
                                    {/* ---------- Image Container ---------- */}
                                    <Box
                                        sx={{
                                            position: "relative",
                                            width: "100%",
                                            aspectRatio: "1 / 1",
                                            bgcolor: "rgb(var(--surface-container))",
                                            overflow: "hidden",
                                        }}
                                    >
                                        {!loaded[item.id] && (
                                            <Box
                                                sx={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    background:
                                                        "linear-gradient(90deg, transparent 25%, rgb(var(--surface-bright) / 0.2) 50%, transparent 75%)",
                                                    backgroundSize: "200% 100%",
                                                    animation: "shimmer 1.4s infinite",
                                                }}
                                            />
                                        )}
                                        <img
                                            src={imgSrc}
                                            alt={item.product_name}
                                            onLoad={() =>
                                                setLoaded((prev) => ({ ...prev, [item.id]: true }))
                                            }
                                            onError={(e) => {
                                                const target = e.currentTarget;
                                                if (target.src.includes(NO_IMAGE_PLACEHOLDER)) return;
                                                target.src = NO_IMAGE_PLACEHOLDER;
                                                setLoaded((prev) => ({ ...prev, [item.id]: true }));
                                            }}
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
                                                opacity: loaded[item.id] ? 1 : 0,
                                                transition: "opacity 0.35s ease",
                                            }}
                                        />

                                        {/* ----- Discount overlays (identical to Index) ----- */}
                                        {hasDiscount && (
                                            <>
                                                {/* Full-width countdown bar at the very top */}
                                                {discountEnds && (
                                                    <Box
                                                        sx={{
                                                            position: "absolute",
                                                            top: 0,
                                                            left: 0,
                                                            width: "100%",
                                                            zIndex: 3,
                                                            bgcolor: "rgb(var(--inverse-surface) / 0.7)",
                                                            backdropFilter: "blur(4px)",
                                                            px: 1,
                                                            py: 0.5,
                                                            display: "flex",
                                                            justifyContent: "center",
                                                            alignItems: "center",
                                                            borderBottom: "1px solid rgb(var(--inverse-on-surface) / 0.1)",
                                                        }}
                                                    >
                                                        <DiscountCountdown endsAt={discountEnds} />
                                                    </Box>
                                                )}

                                                {/* Discount percentage chip placed just below the bar */}
                                                <Chip
                                                    label={`${discountPercent}% OFF`}
                                                    size="small"
                                                    sx={{
                                                        position: "absolute",
                                                        top: 36,
                                                        left: 8,
                                                        zIndex: 2,
                                                        bgcolor: "error.main",
                                                        color: "error.contrastText",
                                                        fontWeight: 700,
                                                        fontSize: "0.7rem",
                                                        height: 26,
                                                        borderRadius: 1,
                                                        boxShadow: sellerShadow("0 2px 8px", 0.15),
                                                        pointerEvents: "none",
                                                    }}
                                                />
                                            </>
                                        )}
                                        {isSellerPrice && (
                                            <Chip
                                                label="Seller Price"
                                                size="small"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: 8,
                                                    left: 8,
                                                    zIndex: 2,
                                                    bgcolor: "rgb(var(--inverse-surface))",
                                                    color: "rgb(var(--inverse-on-surface))",
                                                    fontWeight: 600,
                                                    fontSize: "0.65rem",
                                                    height: 22,
                                                    borderRadius: 1,
                                                    boxShadow: sellerShadow("0 2px 4px", 0.2),
                                                    pointerEvents: "none",
                                                }}
                                            />
                                        )}
                                    </Box>

                                    {/* ---------- Product Info ---------- */}
                                    <Box sx={{ p: 1.5 }}>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}
                                        >
                                            {item.category?.category_name || "General"}
                                        </Typography>
                                        <Typography
                                            fontWeight={600}
                                            fontSize="0.95rem"
                                            noWrap
                                            sx={{ mb: 0.5 }}
                                        >
                                            {item.product_name}
                                        </Typography>

                                        <Stack direction="row" alignItems="baseline" spacing={0.5}>
                                            <Typography
                                                fontWeight={700}
                                                fontSize="1.1rem"
                                                color={hasDiscount ? "error" : "text.primary"}
                                            >
                                                ${displayPrice.toFixed(2)}
                                            </Typography>
                                            {hasDiscount && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        textDecoration: "line-through",
                                                        color: "text.disabled",
                                                    }}
                                                >
                                                    ${originalPrice.toFixed(2)}
                                                </Typography>
                                            )}
                                            {has_tin_cart && (
                                                <Typography variant="caption" color="success.main" sx={{ ml: 'auto !important', fontWeight: 600, fontSize: '0.65rem' }}>
                                                    Individual pricing
                                                </Typography>
                                            )}
                                        </Stack>

                                        <StockCaption stock={item.store_stock} />
                                    </Box>
                                </SellerCard>
                            );
                        })}
                    </Box>

                    {/* Loading / End indicators */}
                    {isLoading && (
                        <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />
                    )}
                    {!hasNextPage && items.length > 0 && (
                        <Typography textAlign="center" color="text.secondary" sx={{ py: 4 }}>
                            🏁 End of catalog
                        </Typography>
                    )}
                    {items.length === 0 && !isLoading && (
                        <Box sx={{ textAlign: "center", py: 8 }}>
                            <ImageNotSupportedIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
                            <Typography color="text.secondary">No results found</Typography>
                        </Box>
                    )}
                    {hasNextPage && items.length > 0 && (
                        <div ref={observerRef} style={{ height: 20 }} />
                    )}
                </Box>
            </Box>

            <style>{`
                @keyframes shimmer {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
            `}</style>
        </SellerLayout>
    );
}
