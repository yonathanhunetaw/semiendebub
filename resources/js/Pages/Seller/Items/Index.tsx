import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    IconButton,
    InputBase,
    Stack,
    Typography,
    useTheme,
    CircularProgress,
    Tooltip,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Drawer,
    Paper,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { SellerCard } from "@/Components/Seller/sellerUi";
import { SELLER_BRAND_DARK } from "@/Components/Seller/sellerConstants";
import { Html5QrcodeScanner } from "html5-qrcode";

// Your original SVG placeholder (no network request)
const NO_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f5f5f5'/%3E%3Cpath d='M160 160 L240 160 M200 120 L200 200' stroke='%23999' stroke-width='8' fill='none'/%3E%3Ccircle cx='200' cy='200' r='80' fill='none' stroke='%23999' stroke-width='8'/%3E%3C/svg%3E";

// Types
interface SellerItem {
    id: number;
    product_name: string;
    image_urls: string[];
    original_price: number;
    final_price: number | null;
    discount_ends_at: string | null;
    store_stock: number;
    sold_count: number;
    category: { category_name: string } | null;
    pricing_matrix: {
        price: number;
        discount_price: number | null;
        discount_ends_at: string | null;
    };
}

interface Props {
    items: SellerItem[];
    nextPageUrl: string | null;
    filters: { search: string; cart_id?: number | null };
}

// Your original image resolver (keeps full URLs as-is)
const resolveImageUrl = (path?: string): string => {
    if (!path) return NO_IMAGE_PLACEHOLDER;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const baseUrl = import.meta.env.VITE_AWS_URL || "http://duka.test:9000/duka-images";
    return `${baseUrl}/${path.replace(/^\//, "")}`;
};



// Discount countdown (unchanged)
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

export default function Index({ items: initialItems, nextPageUrl, filters }: Props) {
    const theme = useTheme();
    const [items, setItems] = React.useState(initialItems);
    const [hasNextPage, setHasNextPage] = React.useState(!!nextPageUrl);
    const [isLoading, setIsLoading] = React.useState(false);
    const [page, setPage] = React.useState(2);
    const [searchInput, setSearchInput] = React.useState(filters?.search || "");
    const observerRef = React.useRef<HTMLDivElement | null>(null);

    // Image loaded state (for shimmer effect)
    const [loaded, setLoaded] = React.useState<Record<number, boolean>>({});

    React.useEffect(() => {
        setItems(initialItems);
        setHasNextPage(!!nextPageUrl);
        setPage(2);
    }, [initialItems, nextPageUrl]);

    // Barcode scanner state
    const [scannerOpen, setScannerOpen] = React.useState(false);
    const scannerRef = React.useRef<Html5QrcodeScanner | null>(null);
    const [scannerInitialized, setScannerInitialized] = React.useState(false);

    const [searchDrawerOpen, setSearchDrawerOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<SellerItem[]>([]);
    const [resultsNextPage, setResultsNextPage] = React.useState<string | null>(null);
    const [resultsLoading, setResultsLoading] = React.useState(false);
    const resultsObserverRef = React.useRef<HTMLDivElement | null>(null);

    // Infinite scroll — uses plain fetch() so Inertia props are never mutated
    const loadMore = async () => {
        if (isLoading || !hasNextPage) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page) });
            if (filters?.cart_id) params.set('cart_id', String(filters.cart_id));
            const res = await fetch(
                route('seller.items.page-json') + '?' + params.toString(),
                { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }
            );
            if (!res.ok) throw new Error('Failed to load page');
            const data = await res.json();
            setItems((prev) => [...prev, ...(data.items || [])]);
            setHasNextPage(!!data.nextPageUrl);
            setPage((p) => p + 1);
        } catch (e) {
            console.error('loadMore error', e);
        } finally {
            setIsLoading(false);
        }
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

    // Search redirect
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchInput.trim()) return;
        setSearchQuery(searchInput.trim());
        setSearchDrawerOpen(true);
        setResultsLoading(true);
        router.get(route('seller.items.search'), { search: searchInput, page: 1 }, {
            preserveState: true,
            only: ['items', 'nextPageUrl'],
            onSuccess: (resp: any) => {
                setSearchResults(resp.props.items || []);
                setResultsNextPage(resp.props.nextPageUrl);
                setResultsLoading(false);
            },
            onError: () => setResultsLoading(false),
        });
    };

    const loadMoreResults = () => {
        if (resultsLoading || !resultsNextPage) return;
        setResultsLoading(true);
        router.get(resultsNextPage, {}, {
            preserveState: true,
            only: ['items', 'nextPageUrl'],
            onSuccess: (resp: any) => {
                setSearchResults(prev => [...prev, ...(resp.props.items || [])]);
                setResultsNextPage(resp.props.nextPageUrl);
                setResultsLoading(false);
            },
        });
    };

    // Use IntersectionObserver for results container
    React.useEffect(() => {
        if (!resultsObserverRef.current || !searchDrawerOpen) return;
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && resultsNextPage && !resultsLoading) loadMoreResults();
        }, { threshold: 0.1 });
        observer.observe(resultsObserverRef.current);
        return () => observer.disconnect();
    }, [searchDrawerOpen, resultsNextPage, resultsLoading]);

    // Barcode scanner (your implementation)
    React.useEffect(() => {
        if (scannerOpen && !scannerInitialized) {
            setTimeout(() => {
                const element = document.getElementById("barcode-reader");
                if (element) {
                    scannerRef.current = new Html5QrcodeScanner(
                        "barcode-reader",
                        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
                        false
                    );
                    scannerRef.current.render(
                        (decodedText) => {
                            setScannerOpen(false);
                            if (decodedText.trim()) {
                                router.get(route("seller.items.search"), { search: decodedText });
                            }
                        },
                        (error) => console.warn(error)
                    );
                    setScannerInitialized(true);
                }
            }, 100);
        }
        return () => {
            if (scannerOpen === false && scannerRef.current) {
                scannerRef.current.clear();
                scannerRef.current = null;
                setScannerInitialized(false);
            }
        };
    }, [scannerOpen, scannerInitialized]);

    return (
        <SellerLayout>
            <Head title="Seller Items" />
            <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
                {/* Search Header */}
                <Box sx={{ px: 2, pt: 1, pb: 2 }}>
                    <Box component="form" onSubmit={handleSearch} sx={{ width: "100%" }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ flex: 1, display: "flex", alignItems: "center", px: 1.5, py: 0.5, borderRadius: 999, bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "#f5f5f5", border: "1px solid", borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)" }}>
                                <SearchRoundedIcon sx={{ color: "text.secondary", mr: 1 }} />
                                <InputBase fullWidth placeholder="Search items" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onFocus={() => router.get(route("seller.items.search"), { search: searchInput || '' })} />
                            </Box>
                            <IconButton type="submit" sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: SELLER_BRAND_DARK, color: "#fff" }}>
                                <SearchRoundedIcon />
                            </IconButton>
                            <IconButton onClick={() => setScannerOpen(true)} sx={{ width: 40, height: 40, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="4" y="6" width="2" height="12" /><rect x="7" y="6" width="1" height="12" /><rect x="9" y="6" width="3" height="12" />
                                    <rect x="13" y="6" width="1" height="12" /><rect x="15" y="6" width="2" height="12" /><rect x="18" y="6" width="2" height="12" /><rect x="21" y="6" width="1" height="12" />
                                </svg>
                            </IconButton>
                        </Stack>
                    </Box>
                </Box>

                {/* Items Grid */}
                <Box sx={{ px: 2 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5, [theme.breakpoints.up("sm")]: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }, [theme.breakpoints.up("md")]: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }, [theme.breakpoints.up("lg")]: { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" } }}>
                        {items.map((item) => {
                            const originalPrice = item.original_price ?? 0;
                            const discountPrice = item.pricing_matrix?.discount_price;
                            const hasDiscount = !!discountPrice && discountPrice < originalPrice;
                            const displayPrice = hasDiscount ? discountPrice : originalPrice;
                            const discountPercent = hasDiscount && originalPrice > 0 ? Math.round(((originalPrice - discountPrice!) / originalPrice) * 100) : 0;
                            const imgSrc = item.image_urls?.[0] ? resolveImageUrl(item.image_urls[0]) : NO_IMAGE_PLACEHOLDER;

                            return (
                                <SellerCard key={item.id} component={Link} href={route("seller.items.show", item.id)} sx={{ p: 0, overflow: "hidden", cursor: "pointer" }}>
                                    {/* Square placeholder box — reserves space & shows shimmer before image loads */}
                                    <Box sx={{ position: "relative", width: "100%", aspectRatio: "1 / 1", bgcolor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "#f0f0f0", overflow: "hidden" }}>
                                        {/* Shimmer overlay while loading */}
                                        {!loaded[item.id] && (
                                            <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.18) 50%, transparent 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
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
                                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded[item.id] ? 1 : 0, transition: "opacity 0.35s ease" }}
                                        />
                                    </Box>
                                    <Box sx={{ p: 1.5 }}>
                                        <Typography fontWeight={800} noWrap>{item.product_name}</Typography>
                                        <Box sx={{ mt: 1 }}>
                                            <Stack direction="row" alignItems="baseline" spacing={0.5}>
                                                <Typography fontWeight={900} sx={{ color: hasDiscount ? "error.main" : "text.primary" }}>{displayPrice.toFixed(2)} Birr</Typography>
                                                {hasDiscount && <Typography variant="caption" sx={{ textDecoration: "line-through", color: "text.disabled" }}>{originalPrice.toFixed(2)} Birr</Typography>}
                                            </Stack>
                                            {hasDiscount && (
                                                <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                                                    <Chip label={`-${discountPercent}% OFF`} size="small" sx={{ bgcolor: "#EAB308", color: "#fff", height: 20, fontSize: "0.62rem" }} />
                                                    {item.discount_ends_at && <DiscountCountdown endsAt={item.discount_ends_at} />}
                                                </Stack>
                                            )}
                                        </Box>
                                        <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                                            <Typography variant="caption" color="text.secondary">{item.sold_count} sold</Typography>
                                            {(searchInput.trim() || filters?.search?.trim()) && item.category && <Chip label={item.category.category_name} size="small" variant="outlined" sx={{ height: 20 }} />}
                                        </Stack>
                                    </Box>
                                </SellerCard>
                            );
                        })}
                    </Box>

                    {isLoading && <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />}
                    {!hasNextPage && items.length > 0 && <Typography textAlign="center" color="text.secondary" sx={{ py: 4 }}>End of catalog</Typography>}
                    {items.length === 0 && !isLoading && (
                        <Box sx={{ textAlign: "center", py: 8 }}>
                            <ImageNotSupportedIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
                            <Typography color="text.secondary">No items found</Typography>
                        </Box>
                    )}
                    {hasNextPage && items.length > 0 && <div ref={observerRef} style={{ height: 20 }} />}
                </Box>

                {/* Barcode Scanner Modal */}
                <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} maxWidth="sm" fullWidth>
                    <DialogTitle>Scan Barcode</DialogTitle>
                    <DialogContent>
                        <div id="barcode-reader" style={{ width: "100%", minHeight: "300px" }}></div>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setScannerOpen(false)}>Cancel</Button>
                    </DialogActions>
                </Dialog>

                {/* Search Results Drawer */}
                <Drawer
                    anchor="bottom"
                    open={searchDrawerOpen}
                    onClose={() => setSearchDrawerOpen(false)}
                    PaperProps={{
                        sx: {
                            borderTopLeftRadius: 16,
                            borderTopRightRadius: 16,
                            maxHeight: '80vh',
                            p: 2,
                        }
                    }}
                >
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Results for "{searchQuery}" ({searchResults.length})
                    </Typography>
                    <Stack spacing={2} sx={{ maxHeight: 'calc(80vh - 80px)', overflowY: 'auto' }}>
                        {searchResults.map((item) => {
                            const originalPrice = item.original_price ?? 0;
                            const discountPrice = item.pricing_matrix?.discount_price;
                            const hasDiscount = !!discountPrice && discountPrice < originalPrice;
                            const displayPrice = hasDiscount ? discountPrice : originalPrice;
                            const imgSrc = item.image_urls?.[0] ? resolveImageUrl(item.image_urls[0]) : NO_IMAGE_PLACEHOLDER;
                            return (
                                <Paper
                                    key={item.id}
                                    component={Link}
                                    href={route("seller.items.show", item.id)}
                                    sx={{ p: 2, display: "flex", gap: 2, cursor: "pointer", textDecoration: "none" }}
                                >
                                    <Box
                                        component="img"
                                        src={imgSrc}
                                        sx={{ width: 60, height: 60, objectFit: "cover", borderRadius: 2 }}
                                        onError={(e) => { (e.target as HTMLImageElement).src = NO_IMAGE_PLACEHOLDER; }}
                                    />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography fontWeight="bold">{item.product_name}</Typography>
                                        <Typography variant="body2" color={hasDiscount ? "error.main" : "text.primary"}>
                                            {displayPrice.toFixed(2)} Birr
                                            {hasDiscount && (
                                                <Typography component="span" variant="caption" sx={{ textDecoration: "line-through", ml: 1 }}>
                                                    {originalPrice.toFixed(2)} Birr
                                                </Typography>
                                            )}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Stock: {item.store_stock} | Sold: {item.sold_count}
                                        </Typography>
                                    </Box>
                                </Paper>
                            );
                        })}
                        {resultsLoading && <CircularProgress sx={{ alignSelf: "center", my: 2 }} />}
                        {resultsNextPage && !resultsLoading && <div ref={resultsObserverRef} style={{ height: 20 }} />}
                        {!resultsNextPage && searchResults.length > 0 && (
                            <Typography textAlign="center" color="text.secondary">No more results</Typography>
                        )}
                    </Stack>
                </Drawer>
            </Box>

            <style>{`
            @keyframes shimmer {
                0% { background-position: 100% 0;
                }
                100% { background-position: -100% 0;
                }
            }
        `}</style>
        </SellerLayout>
    );
}