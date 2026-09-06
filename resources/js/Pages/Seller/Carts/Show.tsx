import {
    SellerCard,
    SellerHeader,
    SELLER_BRAND_DARK,
    sellerName,
    sellerPrice,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import {
    Avatar,
    Box,
    Button,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Stack,
    Typography,
    useTheme,
    Chip,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import React from "react";

interface CartItem {
    id: number;
    product_name: string;
    packaging?: string | null;
    pieces_per_unit?: number | null;
    quantity: number;
    price: number;
    extra_pieces?: number;
    extra_piece_price?: number | null;
}

interface Cart {
    id: number;
    status: string;
    session_id: string;
    customer?: {
        first_name: string;
        last_name: string;
        phone_number?: string;
    };
    items: CartItem[];
}

export default function Show({ cart }: { cart: Cart }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const customerFullname = cart.customer
        ? sellerName([cart.customer.first_name, cart.customer.last_name])
        : "Guest Customer";

    const totalAmount = cart.items.reduce(
        (sum, item) =>
            sum +
            item.price * item.quantity +
            (item.extra_pieces ?? 0) * (item.extra_piece_price ?? 0),
        0,
    );

    const handleRemoveItem = (itemId: number) => {
        if (confirm("Remove this item from cart?")) {
            router.delete(
                route("seller.carts.items.destroy", [cart.id, itemId]),
            );
        }
    };

    return (
        // 1. Set padding to 0 here so the Header can touch the edges
        <Box sx={{ p: 0, bgcolor: "background.default", minHeight: "100vh" }}>
            <Head title={`Cart #${cart.id} - ${customerFullname}`} />

            {/* This will now touch the top and sides */}
            <SellerHeader
                title={customerFullname}
                backHref={route("seller.carts.index")}
                subtitle={`Session ID: ${cart.session_id}`}
            />

            {/* 2. Add the padding back here for the rest of the content */}
            <Box sx={{ px: { xs: 2, md: 3 }, pb: 3 }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={3}
                    mt={4}
                >
                    {/* Left Side: Items List */}
                    <Box sx={{ flex: 2 }}>
                        <SellerCard>
                            <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                mb={2}
                            >
                                <Typography variant="h6" fontWeight={900}>
                                    Current Items ({cart.items.length})
                                </Typography>
                                <Button
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    size="small"
                                    sx={{ borderRadius: 2 }}
                                >
                                    Add Product
                                </Button>
                            </Stack>

                            <Divider sx={{ mb: 2 }} />

                            {cart.items.length > 0 ? (
                                <List disablePadding>
                                    {cart.items.map((item) => (
                                        <ListItem
                                            key={item.id}
                                            secondaryAction={
                                                <IconButton
                                                    edge="end"
                                                    onClick={() =>
                                                        handleRemoveItem(
                                                            item.id,
                                                        )
                                                    }
                                                    color="error"
                                                >
                                                    <DeleteOutlineIcon />
                                                </IconButton>
                                            }
                                            sx={{
                                                bgcolor: isDark
                                                    ? "rgba(255,255,255,0.03)"
                                                    : "rgba(0,0,0,0.02)",
                                                borderRadius: 2,
                                                mb: 1,
                                            }}
                                        >
                                            <ListItemAvatar>
                                                <Avatar
                                                    sx={{
                                                        bgcolor:
                                                            SELLER_BRAND_DARK,
                                                    }}
                                                >
                                                    <ShoppingCartIcon fontSize="small" />
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={
                                                    <Typography
                                                        fontWeight={700}
                                                    >
                                                        {item.product_name}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Stack spacing={0.5} mt={0.5}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            {item.packaging ? `${item.packaging} — ` : ""}
                                                            Qty: {item.quantity} × {sellerPrice(item.price)} Birr
                                                        </Typography>
                                                        {(item.extra_pieces ?? 0) > 0 && (
                                                            <Typography variant="body2" color="text.secondary">
                                                                + {item.extra_pieces} Piece{item.extra_pieces === 1 ? "" : "s"} × {sellerPrice(item.extra_piece_price ?? 0)} Birr
                                                            </Typography>
                                                        )}
                                                        {item.packaging && item.packaging.toLowerCase() !== "piece" && item.pieces_per_unit && item.pieces_per_unit > 1 && (
                                                            <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.8 }}>
                                                                Contains {item.pieces_per_unit} pieces ({sellerPrice(item.price / item.pieces_per_unit)} Birr / piece)
                                                            </Typography>
                                                        )}
                                                    </Stack>
                                                }
                                            />
                                            <Typography
                                                fontWeight={900}
                                                sx={{ mr: 2 }}
                                            >
                                                {sellerPrice(
                                                    item.price * item.quantity +
                                                        (item.extra_pieces ?? 0) *
                                                            (item.extra_piece_price ?? 0),
                                                )} Birr
                                            </Typography>
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Box
                                    sx={{
                                        py: 6,
                                        textAlign: "center",
                                        opacity: 0.5,
                                    }}
                                >
                                    <ShoppingCartIcon
                                        sx={{ fontSize: 48, mb: 1 }}
                                    />
                                    <Typography>This cart is empty</Typography>
                                </Box>
                            )}
                        </SellerCard>
                    </Box>

                    {/* Right Side: Summary & Customer Info */}
                    <Box sx={{ flex: 1 }}>
                        <Stack spacing={3}>
                            <SellerCard>
                                <Typography
                                    variant="h6"
                                    fontWeight={900}
                                    mb={2}
                                >
                                    Summary
                                </Typography>
                                <Stack spacing={2}>
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                    >
                                        <Typography color="text.secondary">
                                            Status
                                        </Typography>
                                        <Chip
                                            label={cart.status.toUpperCase()}
                                            size="small"
                                            color="success"
                                            sx={{
                                                fontWeight: 900,
                                                borderRadius: 1,
                                            }}
                                        />
                                    </Stack>
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                    >
                                        <Typography color="text.secondary">
                                            Subtotal
                                        </Typography>
                                        <Typography fontWeight={700}>
                                            {sellerPrice(totalAmount)} Birr
                                        </Typography>
                                    </Stack>
                                    <Divider />
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                    >
                                        <Typography
                                            variant="h5"
                                            fontWeight={900}
                                        >
                                            Total
                                        </Typography>
                                        <Typography
                                            variant="h5"
                                            fontWeight={900}
                                            color={SELLER_BRAND_DARK}
                                        >
                                            {sellerPrice(totalAmount)} Birr
                                        </Typography>
                                    </Stack>
                                    <Button
                                        variant="contained"
                                        fullWidth
                                        size="large"
                                        sx={{
                                            mt: 2,
                                            bgcolor: SELLER_BRAND_DARK,
                                            fontWeight: 900,
                                            py: 1.5,
                                        }}
                                    >
                                        Checkout
                                    </Button>
                                </Stack>
                            </SellerCard>

                            {cart.customer && (
                                <SellerCard>
                                    <Typography
                                        variant="h6"
                                        fontWeight={900}
                                        mb={2}
                                    >
                                        Customer Contact
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                    >
                                        Phone
                                    </Typography>
                                    <Typography fontWeight={700} mb={2}>
                                        {cart.customer.phone_number ||
                                            "No phone listed"}
                                    </Typography>
                                    <Button
                                        variant="text"
                                        fullWidth
                                        color="inherit"
                                    >
                                        View Full Profile
                                    </Button>
                                </SellerCard>
                            )}
                        </Stack>
                    </Box>
                </Stack>
            </Box>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
