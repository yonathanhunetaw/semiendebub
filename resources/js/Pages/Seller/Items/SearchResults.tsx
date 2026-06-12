import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Typography,
    CircularProgress,
    IconButton,
    Stack,
    Chip,
    useTheme,
    Tooltip
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { SellerCard } from "@/Components/Seller/sellerUi";

// SVG PLACEHOLDER (zero network requests)
const NO_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f5f5f5'/%3E%3Cpath d='M160 160 L240 160 M200 120 L200 200' stroke='%23999' stroke-width='8' fill='none'/%3E%3Ccircle cx='200' cy='200' r='80' fill='none' stroke='%23999' stroke-width='8'/%3E%3C/svg%3E";

interface SearchResultItem {
    id: number;
    product_name: string;
    image_urls: string[];
    original_price: number;
    final_price: number | null;
    discount_ends_at: string | null;
    store_stock: number;
    sold_count: number;
    category: { category_name: string } | null;
    pricing_matrix?: {
        price: number;
        discount_price: number | null;
        discount_ends_at: string | null;
    };
}

interface Props {
    query: string;
    items: SearchResultItem[];
    nextPageUrl: string | null;
    categories?: { id: number; category_name: string }[];
    selectedCategoryId?: number | null;
}

const resolveImageUrl = (path?: string): string => {
    if (!path) return NO_IMAGE_PLACEHOLDER;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const baseUrl = import.meta.env.VITE_AWS_URL || "http://duka.test:9000/duka-images";
    return `${baseUrl}/${path.replace(/^\//, "")}`;
};

function DiscountCountdown({ endsAt }: { endsAt: string | null }) {
    const [timeLeft, setTimeLeft] = React.useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
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
            <Chip
                icon={<AccessTimeIcon sx={{ fontSize: 12 }} />}
                label={label}
                size="small"
                sx={{ height: 20, fontSize: "0.65rem", bgcolor: "#EAB308", color: "#fff" }}
            />
        </Tooltip>
    );
}

export default function SearchResults({ query, items: initialItems, nextPageUrl, categories = [], selectedCategoryId = null }: Props) {
    const theme = useTheme();
    const [items, setItems] = React.useState(initialItems);
    const [hasNextPage, setHasNextPage] = React.useState(!!nextPageUrl);
    const [isLoading, setIsLoading] = React.useState(false);
    const [page, setPage] = React.useState(2);
    const observerRef = React.useRef<HTMLDivElement | null>(null);
    const [loaded, setLoaded] = React.useState<Record<number, boolean>>({});

    React.useEffect(() => {
        setItems(initialItems);
        setHasNextPage(!!nextPageUrl);
        setPage(2);
    }, [initialItems, nextPageUrl]);

    const loadMore = () => {
        if (isLoading || !hasNextPage) return;
        setIsLoading(true);
        router.get(
            route("seller.items.search"),
            { search: query, category_id: selectedCategoryId || undefined, page },
            {
                preserveState: true,
                preserveScroll: true,
                only: ["items", "nextPageUrl"],
                onSuccess: (resp: any) => {
                    setItems(prev => [...prev, ...(resp.props.items || [])]);
                    setHasNextPage(!!resp.props.nextPageUrl);
                    setPage(p => p + 1);
                    setIsLoading(false);
                },
                onError: () => setIsLoading(false)
            }
        );
    };

    React.useEffect(() => {
        if (!observerRef.current) return;
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasNextPage && !isLoading) loadMore();
        }, { threshold: 0.1, rootMargin: "100px" });
        observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isLoading]);

    const handleCategorySelect = (categoryId: number | null) => {
        router.get(route("seller.items.search"), {
            search: query,
            category_id: categoryId || undefined
        });
    };

    return (
        <SellerLayout>
            <Head title={`Search: ${query || 'All Items'}`} />
            <Box sx={{ p: 2, bgcolor: "background.default", minHeight: "100vh" }}>
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <IconButton component={Link} href={route("seller.items.index")}><ArrowBackRoundedIcon /></IconButton>
                    <Typography variant="h6">Results for "{query || 'All Items'}" ({items.length})</Typography>
                </Stack>

                {/* Categories Filter List */}
                {categories.length > 0 && (
                    <Box sx={{ mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap', overflowX: 'auto', pb: 1 }}>
                        <Chip
                            label="All"
                            clickable
                            color={selectedCategoryId === null ? "primary" : "default"}
                            onClick={() => handleCategorySelect(null)}
                            sx={{ fontWeight: 'bold' }}
                        />
                        {categories.map((cat) => (
                            <Chip
                                key={cat.id}
                                label={cat.category_name}
                                clickable
                                color={selectedCategoryId === cat.id ? "primary" : "default"}
                                onClick={() => handleCategorySelect(cat.id)}
                                sx={{ fontWeight: 'bold' }}
                            />
                        ))}
                    </Box>
                )}

                {/* Items Grid using SellerCard (fit fully, height is auto) */}
                <Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5, [theme.breakpoints.up("sm")]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }, [theme.breakpoints.up("md")]: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }, [theme.breakpoints.up("lg")]: { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" } }}>
                        {items.map((item) => {
                            const originalPrice = item.original_price ?? 0;
                            const discountPrice = item.pricing_matrix?.discount_price ?? null;
                            const hasDiscount = !!discountPrice && discountPrice < originalPrice;
                            const displayPrice = hasDiscount ? discountPrice : originalPrice;
                            const discountPercent = hasDiscount && originalPrice > 0 ? Math.round(((originalPrice - discountPrice!) / originalPrice) * 100) : 0;
                            const imgSrc = item.image_urls?.[0] ? resolveImageUrl(item.image_urls[0]) : NO_IMAGE_PLACEHOLDER;

                            return (
                                <SellerCard key={item.id} component={Link} href={route("seller.items.show", item.id)} sx={{ p: 0, overflow: "hidden", cursor: "pointer" }}>
                                    {/* Image container without height: 140 constraint so images fit fully */}
                                    <Box sx={{ position: "relative", bgcolor: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {!loaded[item.id] && (
                                            <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)", backgroundSize: "400% 100%", animation: "shimmer 1.2s infinite" }} />
                                        )}
                                        <img
                                            src={imgSrc}
                                            alt={item.product_name}
                                            onLoad={() => setLoaded(prev => ({ ...prev, [item.id]: true }))}
                                            onError={(e) => {
                                                const target = e.currentTarget;
                                                if (target.src.includes(NO_IMAGE_PLACEHOLDER)) return;
                                                target.src = NO_IMAGE_PLACEHOLDER;
                                                setLoaded(prev => ({ ...prev, [item.id]: true }));
                                            }}
                                            style={{ width: "100%", height: "auto", display: "block", opacity: loaded[item.id] ? 1 : 0, transition: "opacity 0.3s ease" }}
                                        />
                                    </Box>
                                    <Box sx={{ p: 1.5 }}>
                                        <Typography fontWeight={800} noWrap>{item.product_name}</Typography>
                                        <Box sx={{ mt: 1 }}>
                                            <Stack direction="row" alignItems="baseline" spacing={0.5}>
                                                <Typography fontWeight={900} sx={{ color: hasDiscount ? "error.main" : "text.primary" }}>{displayPrice.toFixed(2)} Birr</Typography>
                                                {hasDiscount && <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>{originalPrice.toFixed(2)} Birr</Typography>}
                                            </Stack>
                                            {hasDiscount && item.discount_ends_at && (
                                                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                                                    <Chip label={`-${discountPercent}% OFF`} size="small" sx={{ bgcolor: "#EAB308", color: "#fff", height: 20 }} />
                                                    <DiscountCountdown endsAt={item.discount_ends_at} />
                                                </Stack>
                                            )}
                                        </Box>
                                        <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary">{item.sold_count} sold</Typography>
                                            {item.category && <Chip label={item.category.category_name} size="small" variant="outlined" sx={{ height: 20 }} />}
                                        </Stack>
                                    </Box>
                                </SellerCard>
                            );
                        })}
                    </Box>
                </Box>

                {isLoading && <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />}
                {!hasNextPage && items.length > 0 && <Typography textAlign="center" color="text.secondary" sx={{ py: 4 }}>End of catalog</Typography>}
                {hasNextPage && items.length > 0 && <div ref={observerRef} style={{ height: 20 }} />}
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