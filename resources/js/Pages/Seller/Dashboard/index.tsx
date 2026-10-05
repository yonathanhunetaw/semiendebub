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
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { SellerCard, sellerShadow } from "@/Components/Seller/sellerUi";
import StockCaption from "@/Components/Seller/StockCaption";
import { Html5QrcodeScanner } from "html5-qrcode";

// ======================== SVG PLACEHOLDER ========================
const NO_IMAGE_PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23f5f5f5'/%3E%3Cpath d='M160 160 L240 160 M200 120 L200 200' stroke='%23999' stroke-width='8' fill='none'/%3E%3Ccircle cx='200' cy='200' r='80' fill='none' stroke='%23999' stroke-width='8'/%3E%3C/svg%3E";

// ======================== TYPES ========================
interface DashboardItem {
    /** Individual (retail) tier from PriceProvider, when one applies. */
    individual_price?: {
        price: number | null;
        discount_price: number | null;
        discount_ends_at: string | null;
    } | null;
    id: number;
    product_name: string;
    image_urls: string[];
    store_price: number | null;        // original price
    final_price: number | null;        // discounted price (if any)
    discount_ends_at: string | null;   // when discount ends
    sold_count: number;
    store_stock?: number;
    category?: { category_name: string } | null;
    pricing_matrix?: Array<{
        level: string;
        price: number;
        discount_price: number | null;
        discount_ends_at: string | null;
        final: number;
    }>;
}

interface Props {
    items: DashboardItem[];
    store: any;
    nextPageUrl?: string | null;
    filters?: { search: string };
    categories?: string[];
    has_tin_cart?: boolean;
    top_cart_is_individual?: boolean;
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
    else label = `${minutes}m ${seconds}s`;

    return (
        <Tooltip title={`Discount ends: ${new Date(endsAt).toLocaleString()}`} arrow>
            <Stack direction="row" alignItems="center" spacing={0.5}>
                <AccessTimeIcon sx={{ fontSize: "0.85rem", color: "rgb(var(--inverse-primary))" }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: "rgb(var(--inverse-on-surface))", fontSize: "0.75rem" }}>
                    {label}
                </Typography>
            </Stack>
        </Tooltip>
    );
}

// ======================== MAIN DASHBOARD ========================
export default function Dashboard({ items: initialItems, store, nextPageUrl, filters = { search: '' }, categories = [], has_tin_cart = false, top_cart_is_individual = false }: Props) {
    const theme = useTheme();
    const [items, setItems] = React.useState(initialItems);
    const [hasNextPage, setHasNextPage] = React.useState(!!nextPageUrl);
    const [isLoading, setIsLoading] = React.useState(false);
    const [page, setPage] = React.useState(2);
    const [searchInput, setSearchInput] = React.useState(filters?.search || "");
    const observerRef = React.useRef<HTMLDivElement | null>(null);
    const [loaded, setLoaded] = React.useState<Record<number, boolean>>({});

    // DEBUG: log incoming props
    console.log('Dashboard props:', { items, categories, filters });

    // Build category list: "Active Inventory" first
    const categoryList = React.useMemo(() => {
        const base = categories.length > 0 ? categories : Array.from(
            new Set(items.map(item => item.category?.category_name).filter(Boolean) as string[])
        );
        const hasActive = base.some(c => c === "Active Inventory");
        if (!hasActive) return ["Active Inventory", ...base];
        const without = base.filter(c => c !== "Active Inventory");
        return ["Active Inventory", ...without];
    }, [categories, items]);

    React.useEffect(() => {
        setItems(initialItems);
        setHasNextPage(!!nextPageUrl);
        setPage(2);
    }, [initialItems, nextPageUrl]);

    // Barcode scanner
    const [scannerOpen, setScannerOpen] = React.useState(false);
    const scannerRef = React.useRef<Html5QrcodeScanner | null>(null);
    const [scannerInitialized, setScannerInitialized] = React.useState(false);

    // ========== INFINITE SCROLL ==========
    const loadMore = () => {
        if (isLoading || !hasNextPage) return;
        setIsLoading(true);
        router.get(
            route("seller.dashboard"),
            { page, search: searchInput },
            {
                preserveState: true,
                preserveScroll: true,
                only: ["items", "nextPageUrl"],
                onSuccess: (resp: any) => {
                    const newItems = resp.props.items || [];
                    setItems((prev) => [...prev, ...newItems]);
                    setHasNextPage(!!resp.props.nextPageUrl);
                    setPage((p) => p + 1);
                    setIsLoading(false);
                },
                onError: () => setIsLoading(false),
            }
        );
    };

    React.useEffect(() => {
        if (!observerRef.current || !hasNextPage) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !isLoading) loadMore();
            },
            { threshold: 0.1, rootMargin: "100px" }
        );
        observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isLoading]);

    // ========== SEARCH ==========
    const navigateToSearch = (query: string) => {
        if (!query.trim()) return;
        router.get(route("seller.items.search"), { search: query }, {
            preserveState: true,
        });
    };

    const handleSearchIconClick = () => {
        navigateToSearch(searchInput);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            navigateToSearch(searchInput);
        }
    };

    // ========== BARCODE SCANNER ==========
    React.useEffect(() => {
        if (scannerOpen && !scannerInitialized) {
            setTimeout(() => {
                const element = document.getElementById("barcode-reader-dashboard");
                if (element) {
                    scannerRef.current = new Html5QrcodeScanner(
                        "barcode-reader-dashboard",
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
            <Head title="Seller Dashboard" />
            <Box sx={{ bgcolor: "background.default", minHeight: "100vh", pb: 10 }}>
                {/* ========== SEARCH HEADER ========== */}
                <Box sx={{ px: { xs: 2, md: 4 }, pt: 2, pb: 2, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                        <Box
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
                                placeholder="Search products..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                sx={{ fontSize: "0.95rem" }}
                            />
                        </Box>

                        <IconButton
                            onClick={handleSearchIconClick}
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

                        <IconButton
                            onClick={() => setScannerOpen(true)}
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: 999,
                                border: "1px solid",
                                borderColor: "divider",
                                color: "text.secondary",
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="4" y="6" width="2" height="12" />
                                <rect x="7" y="6" width="1" height="12" />
                                <rect x="9" y="6" width="3" height="12" />
                                <rect x="13" y="6" width="1" height="12" />
                                <rect x="15" y="6" width="2" height="12" />
                                <rect x="18" y="6" width="2" height="12" />
                                <rect x="21" y="6" width="1" height="12" />
                            </svg>
                        </IconButton>
                    </Stack>
                </Box>

                {/* ========== MAIN CONTENT ========== */}
                <Box sx={{ px: { xs: 2, md: 4 }, pt: 3 }}>
                    {/* ---------- Categories Row ---------- */}
                    {categoryList.length > 0 && (
                        <Box sx={{ mb: 4, overflowX: "auto", whiteSpace: "nowrap", pb: 1, "&::-webkit-scrollbar": { display: "none" } }}>
                            <Stack direction="row" spacing={3} sx={{ display: "inline-flex", alignItems: "center" }}>
                                {categoryList.map((cat) => {
                                    // Map category names to icons (using lucide icons later)
                                    const iconMap: Record<string, React.ReactNode> = {
                                        "Active Inventory": <span className="material-symbols-outlined">home</span>,
                                        "Pencil": <span className="material-symbols-outlined">edit</span>,
                                        "Fluid (Whiteout)": <span className="material-symbols-outlined">brush</span>,
                                        "NoteBook 25k": <span className="material-symbols-outlined">note</span>,
                                        "Binding": <span className="material-symbols-outlined">attach_file</span>,
                                        "Fastener": <span className="material-symbols-outlined">push_pin</span>,
                                        "NoteBook A5": <span className="material-symbols-outlined">note</span>,
                                        "Highlighter": <span className="material-symbols-outlined">highlight</span>,
                                        "Ruler": <span className="material-symbols-outlined">straighten</span>,
                                        "Files & Folders": <span className="material-symbols-outlined">folder</span>,
                                        "Box File": <span className="material-symbols-outlined">archive</span>,
                                        "Sticky Notes": <span className="material-symbols-outlined">note_add</span>,
                                        "Calculator": <span className="material-symbols-outlined">calculate</span>,
                                        "Canvas": <span className="material-symbols-outlined">palette</span>,
                                        "Paint Brush": <span className="material-symbols-outlined">brush</span>,
                                    };
                                    return (
                                        <Box key={cat} sx={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                                            <Box
                                                sx={{
                                                    width: 56,
                                                    height: 56,
                                                    borderRadius: "50%",
                                                    bgcolor: cat === "Active Inventory" ? "rgb(var(--primary-container))" : "rgb(var(--surface-container))",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    border: cat === "Active Inventory" ? "2px solid rgb(var(--on-surface))" : "none",
                                                    transition: "all 0.2s",
                                                    "&:hover": { transform: "scale(1.05)", bgcolor: "rgb(var(--primary-container))" },
                                                }}
                                            >
                                                {iconMap[cat] || <span className="material-symbols-outlined">category</span>}
                                            </Box>
                                            <Typography variant="caption" fontWeight={cat === "Active Inventory" ? 700 : 500} sx={{ mt: 0.5 }}>
                                                {cat}
                                            </Typography>
                                        </Box>
                                    );
                                })}
                                {/* Item count badge at the end */}
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        ml: 1,
                                        px: 2,
                                        py: 0.5,
                                        borderRadius: 999,
                                        bgcolor: "rgb(var(--surface-container-high))",
                                        color: "text.secondary",
                                        fontSize: "0.75rem",
                                        fontWeight: 500,
                                    }}
                                >
                                    {items.length} items
                                </Box>
                            </Stack>
                        </Box>
                    )}

                    {/* ---------- PRODUCT GRID ---------- */}
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
                            // 1. The original "strikethrough" price is the store tier's resolved price
                            let originalPrice = item.store_price ?? 0;
                            if (top_cart_is_individual && item.individual_price?.price != null) {
                                originalPrice = item.individual_price.price;
                            }

                            // 2. The active price to pay is the deepest tier's final price
                            const displayPrice = item.final_price ?? originalPrice;

                            // 3. Discount math (whether from tier override or actual discount)
                            const hasDiscount = displayPrice < originalPrice;
                            const discountPercent =
                                hasDiscount && originalPrice > 0
                                    ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
                                    : 0;

                            // 4. Extract active countdown if the deepest tier has one
                            const deepestTier = item.pricing_matrix?.[item.pricing_matrix.length - 1];
                            const discountEnds = deepestTier?.discount_ends_at ?? item.discount_ends_at ?? null;

                            // 5. Determine if we should show the "Seller Price" badge
                            const isSellerPrice = deepestTier?.level === "seller";

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

                                        {/* ----- 🔥 DISCOUNT OVERLAYS ----- */}
                                        {hasDiscount && (
                                            <>
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
                                        </Stack>
                                        {has_tin_cart && (
                                            <Typography variant="caption" color="success.main" sx={{ display: "block", mt: hasDiscount ? 0.25 : 0, fontWeight: 600, fontSize: "0.65rem" }}>
                                                Including VAT
                                            </Typography>
                                        )}

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
                            <Typography color="text.secondary">No items found</Typography>
                        </Box>
                    )}
                    {hasNextPage && items.length > 0 && (
                        <div ref={observerRef} style={{ height: 20 }} />
                    )}
                </Box>

                {/* Barcode Scanner Modal */}
                <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} maxWidth="sm" fullWidth>
                    <DialogTitle>Scan Barcode</DialogTitle>
                    <DialogContent>
                        <div id="barcode-reader-dashboard" style={{ width: "100%", minHeight: "300px" }}></div>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setScannerOpen(false)}>Cancel</Button>
                    </DialogActions>
                </Dialog>
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
