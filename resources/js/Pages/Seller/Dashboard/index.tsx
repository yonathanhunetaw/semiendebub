import React, { useState } from "react";
import { Head, Link } from "@inertiajs/react";
import SellerLayout from "@/Layouts/SellerLayout";
import { SELLER_BRAND_DARK, sellerPrice } from "@/Components/Seller/sellerUi";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import CheckroomRoundedIcon from "@mui/icons-material/CheckroomRounded";
import WatchRoundedIcon from "@mui/icons-material/WatchRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";
import {
    Box,
    Chip,
    Stack,
    Typography,
    TextField,
    InputAdornment,
    Card,
    CardContent,
    CardMedia,
    IconButton,
} from "@mui/material";

interface SellerVariant {
    id: number;
    final_price?: number | null;
    store_discount_price?: number | null;
    store_price?: number | null;
    price?: number | null;
}

interface SellerItem {
    id: number;
    product_name: string;
    product_images?: string | string[];
    category?: { id: number; name: string };
    variants?: SellerVariant[];
}

interface SellerStore {
    store_name?: string;
    name?: string;
}

// Extract base/old price
function getOldPrice(item: SellerItem) {
    const prices = (item.variants ?? [])
        .map((v) => v.store_price ?? v.price)
        .filter((p): p is number => p != null);
    return prices.length ? Math.max(...prices) : null;
}

// Extract active/discount price
function getNewPrice(item: SellerItem) {
    const prices = (item.variants ?? [])
        .map((v) => v.final_price ?? v.store_discount_price ?? v.store_price ?? v.price)
        .filter((p): p is number => p != null);
    return prices.length ? Math.min(...prices) : null;
}

// Extract Images safely
function getImages(item: SellerItem): string[] {
    if (!item.product_images) return ["/img/default.jpg"];
    if (Array.isArray(item.product_images)) return item.product_images;
    try {
        const parsed = JSON.parse(item.product_images);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : ["/img/default.jpg"];
    } catch {
        return ["/img/default.jpg"];
    }
}

export default function Index({
    items = [],
    store,
}: {
    items?: SellerItem[];
    store?: SellerStore | null;
}) {
    const [searchQuery, setSearchQuery] = useState("");

    // Mock categories based on your catalog structure
    const categories = [
        { id: 1, name: "All", icon: <LocalOfferRoundedIcon fontSize="small" /> },
        { id: 2, name: "Apparel", icon: <CheckroomRoundedIcon fontSize="small" /> },
        { id: 3, name: "Accessories", icon: <WatchRoundedIcon fontSize="small" /> },
        { id: 4, name: "Jewelry", icon: <DiamondRoundedIcon fontSize="small" /> },
    ];

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "#0f172a", // surface-canvas-dark fixes the white-on-white bug
                color: "#ffffff",
                pb: 10
            }}
        >
            <Head title="Home | Seller" />

            {/* Topbar / Header */}
            <Box sx={{ px: 2, pt: 4, pb: 2, position: "sticky", top: 0, bgcolor: "#0f172a", zIndex: 10 }}>
                <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.02em" }}>
                    Home
                </Typography>

                {/* Search Bar */}
                <TextField
                    fullWidth
                    placeholder="Search your catalog..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    variant="outlined"
                    sx={{
                        "& .MuiOutlinedInput-root": {
                            bgcolor: "#1e293b", // surface-panel-dark
                            color: "#ffffff",
                            borderRadius: "12px",
                            "& fieldset": { borderColor: "#ffffff1f" },
                            "&:hover fieldset": { borderColor: SELLER_BRAND_DARK },
                            "&.Mui-focused fieldset": { borderColor: SELLER_BRAND_DARK },
                        },
                    }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchRoundedIcon sx={{ color: "#a1a1aa" }} />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>

            {/* Horizontal Categories */}
            <Box sx={{ px: 2, mb: 3 }}>
                <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                        overflowX: "auto",
                        pb: 1,
                        "&::-webkit-scrollbar": { display: "none" } // Hide scrollbar for clean UI
                    }}
                >
                    {categories.map((cat) => (
                        <Chip
                            key={cat.id}
                            icon={cat.icon}
                            label={cat.name}
                            clickable
                            sx={{
                                bgcolor: cat.name === "All" ? SELLER_BRAND_DARK : "#1e293b",
                                color: "#ffffff",
                                fontWeight: 700,
                                px: 1,
                                py: 2.5,
                                borderRadius: "12px",
                                "& .MuiChip-icon": { color: "inherit" },
                                "&:hover": { bgcolor: SELLER_BRAND_DARK },
                            }}
                        />
                    ))}
                </Stack>
            </Box>

            {/* Product Grid */}
            <Box sx={{ px: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                    Your Items
                </Typography>

                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 2 }}>
                    {items.map((item) => {
                        const oldPrice = getOldPrice(item);
                        const newPrice = getNewPrice(item);
                        const images = getImages(item);

                        // Calculate % drop
                        let dropPercent = 0;
                        if (oldPrice && newPrice && oldPrice > newPrice) {
                            dropPercent = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
                        }

                        return (
                            <Card
                                key={item.id}
                                component={Link}
                                href={route("seller.items.show", item.id)}
                                sx={{
                                    bgcolor: "#1e293b",
                                    borderRadius: "12px",
                                    textDecoration: "none",
                                    border: "1px solid #ffffff1f",
                                    overflow: "hidden"
                                }}
                            >
                                {/* Horizontal Image Carousel */}
                                <Box
                                    sx={{
                                        display: "flex",
                                        overflowX: "auto",
                                        scrollSnapType: "x mandatory",
                                        "&::-webkit-scrollbar": { display: "none" }
                                    }}
                                >
                                    {images.map((img, idx) => (
                                        <CardMedia
                                            key={idx}
                                            component="img"
                                            height="160"
                                            image={img}
                                            alt={item.product_name}
                                            sx={{
                                                width: "100%",
                                                flexShrink: 0,
                                                scrollSnapAlign: "center",
                                                objectFit: "cover"
                                            }}
                                        />
                                    ))}
                                </Box>

                                <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 700, color: "#ffffff", mb: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                                    >
                                        {item.product_name}
                                    </Typography>

                                    {/* Pricing Layout */}
                                    <Stack spacing={0.5}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: SELLER_BRAND_DARK }}>
                                                {sellerPrice(newPrice)}
                                            </Typography>
                                            {dropPercent > 0 && (
                                                <Chip
                                                    label={`-${dropPercent}%`}
                                                    size="small"
                                                    sx={{ bgcolor: "#dc2626", color: "#ffffff", fontWeight: 800, height: 20, fontSize: "0.7rem" }}
                                                />
                                            )}
                                        </Stack>

                                        {dropPercent > 0 && oldPrice && (
                                            <Typography variant="caption" sx={{ textDecoration: "line-through", color: "#71717a", fontWeight: 600 }}>
                                                {sellerPrice(oldPrice)}
                                            </Typography>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
