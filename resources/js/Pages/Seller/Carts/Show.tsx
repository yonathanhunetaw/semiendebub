import {
    SellerCard,
    SellerHeader,
    SELLER_BRAND_DARK,
    sellerName,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router } from "@inertiajs/react";
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import React from "react";

interface CartItem {
    id: number;
    product_name: string;
    quantity: number;
    price: number;
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

    const totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const handleRemoveItem = (itemId: number) => {
        if (confirm("Remove this item from cart?")) {
            router.delete(route("seller.carts.items.destroy", [cart.id, itemId]));
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: "background.default", minHeight: "100vh" }}>
            <Head title={`Cart #${cart.id} - ${customerFullname}`} />

            <Button
                component={Link}
                href={route("seller.carts.index")}
                startIcon={<ArrowBackIcon />}
                sx={{ mb: 3, color: "text.secondary" }}
            >
                Back to Carts
            </Button>

            <SellerHeader
                title={customerFullname}
                subtitle={`Session ID: ${cart.session_id}`}
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} mt={4}>

                {/* Left Side: Items List */}
                <Box sx={{ flex: 2 }}>
                    <SellerCard>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
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
                                            <IconButton edge="end" onClick={() => handleRemoveItem(item.id)} color="error">
                                                <DeleteOutlineIcon />
                                            </IconButton>
                                        }
                                        sx={{
                                            bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                                            borderRadius: 2,
                                            mb: 1
                                        }}
                                    >
                                        <ListItemAvatar>
                                            <Avatar sx={{ bgcolor: SELLER_BRAND_DARK }}>
                                                <ShoppingCartIcon fontSize="small" />
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={<Typography fontWeight={700}>{item.product_name}</Typography>}
                                            secondary={`Qty: ${item.quantity} × $${item.price}`}
                                        />
                                        <Typography fontWeight={900} sx={{ mr: 2 }}>
                                            ${(item.price * item.quantity).toFixed(2)}
                                        </Typography>
                                    </ListItem>
                                ))}
                            </List>
                        ) : (
                            <Box sx={{ py: 6, textAlign: 'center', opacity: 0.5 }}>
                                <ShoppingCartIcon sx={{ fontSize: 48, mb: 1 }} />
                                <Typography>This cart is empty</Typography>
                            </Box>
                        )}
                    </SellerCard>
                </Box>

                {/* Right Side: Summary & Customer Info */}
                <Box sx={{ flex: 1 }}>
                    <Stack spacing={3}>
                        <SellerCard>
                            <Typography variant="h6" fontWeight={900} mb={2}>
                                Summary
                            </Typography>
                            <Stack spacing={2}>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography color="text.secondary">Status</Typography>
                                    <Chip
                                        label={cart.status.toUpperCase()}
                                        size="small"
                                        color="success"
                                        sx={{ fontWeight: 900, borderRadius: 1 }}
                                    />
                                </Stack>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography color="text.secondary">Subtotal</Typography>
                                    <Typography fontWeight={700}>${totalAmount.toFixed(2)}</Typography>
                                </Stack>
                                <Divider />
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography variant="h5" fontWeight={900}>Total</Typography>
                                    <Typography variant="h5" fontWeight={900} color={SELLER_BRAND_DARK}>
                                        ${totalAmount.toFixed(2)}
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
                                        py: 1.5
                                    }}
                                >
                                    Checkout
                                </Button>
                            </Stack>
                        </SellerCard>

                        {cart.customer && (
                            <SellerCard>
                                <Typography variant="h6" fontWeight={900} mb={2}>
                                    Customer Contact
                                </Typography>
                                <Typography variant="body2" color="text.secondary">Phone</Typography>
                                <Typography fontWeight={700} mb={2}>{cart.customer.phone_number || "No phone listed"}</Typography>
                                <Button variant="text" fullWidth color="inherit">
                                    View Full Profile
                                </Button>
                            </SellerCard>
                        )}
                    </Stack>
                </Box>
            </Stack>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
