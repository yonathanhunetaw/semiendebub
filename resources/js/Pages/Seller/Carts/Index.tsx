import React, { useState } from "react";
import { router, Head, Link } from "@inertiajs/react";
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor,
    useSensor, useSensors
} from "@dnd-kit/core";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import {
    arrayMove, SortableContext, sortableKeyboardCoordinates,
    verticalListSortingStrategy, useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragHandleIcon from "@mui/icons-material/DragHandle";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Avatar, Box, Chip, IconButton, Stack, Typography, useTheme } from "@mui/material";
import SellerLayout from "@/Layouts/SellerLayout";

// --- Utilities ---
const formatName = (first?: string, last?: string) => [first, last].filter(Boolean).join(" ");
const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

// 1. Fixed Layout for the Row
function SortableCartRow({ cart, children }: { cart: any, children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: cart.id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <Box
            ref={setNodeRef}
            style={style}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1 // Natural spacing between handle and card
            }}
        >
            {/* The Drag Handle - Now inline flex, not absolute */}
            <Box
                {...attributes}
                {...listeners}
                sx={{
                    cursor: 'grab',
                    display: 'flex',
                    p: 1, // Larger touch target for mobile/mouse
                    color: 'text.secondary',
                    opacity: 0.5,
                    '&:hover': { opacity: 1, color: 'text.primary' }
                }}
            >
                <DragHandleIcon />
            </Box>

            {/* The Card Container */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {children}
            </Box>
        </Box>
    );
}

export default function Index({ carts }: { carts: any }) {
    const theme = useTheme();
    const [cartList, setCartList] = useState(Array.isArray(carts) ? carts : (carts.data || []));
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = cartList.findIndex((c: any) => c.id === active.id);
        const newIndex = cartList.findIndex((c: any) => c.id === over.id);
        const newOrder = arrayMove(cartList, oldIndex, newIndex);

        setCartList(newOrder);
        router.post(route('seller.carts.reorder'), { order: newOrder.map((c: any) => c.id) }, { preserveScroll: true });
    };

    const isDark = theme.palette.mode === 'dark';
    const contrastText = isDark ? "#000" : "#fff";
    const subtextOpacity = isDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.7)";

    return (
        // 2. Removed the "pl: 6" hack here
        <Box sx={{ bgcolor: "background.default", minHeight: "100vh", color: "text.primary" }}>
            <Head title="Seller Carts" />

            <Box sx={{ px: 2, pt: 4, pb: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>Carts</Typography>
                <IconButton component={Link} href={route("seller.carts.create")} sx={{ bgcolor: "primary.main", color: contrastText }}>
                    <AddRoundedIcon />
                </IconButton>
            </Box>

            <Box sx={{ px: 2 }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={cartList} strategy={verticalListSortingStrategy}>
                        <Stack spacing={1.5}>
                            {cartList.map((cart: any) => {
                                const customerName = formatName(cart.customer?.first_name, cart.customer?.last_name);
                                const sellerLabel = formatName(cart.seller?.first_name, cart.seller?.last_name);

                                return (
                                    <SortableCartRow key={cart.id} cart={cart}>
                                        {/* 3. Restored display: 'block' so the background doesn't collapse */}
                                        <Box
                                            component={Link}
                                            href={route("seller.carts.show", cart.id)}
                                            sx={{
                                                textDecoration: "none",
                                                display: "block",
                                                p: 2,
                                                borderRadius: 4,
                                                bgcolor: "primary.main",
                                                border: "1px solid rgba(0,0,0,0.05)",
                                                transition: "transform 0.1s ease",
                                                "&:active": { transform: "scale(0.98)" }
                                            }}
                                        >
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Avatar sx={{ bgcolor: isDark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)", color: contrastText, fontWeight: 900, fontSize: "0.875rem" }}>
                                                    {getInitials(customerName || `C${cart.id}`)}
                                                </Avatar>

                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Stack direction="row" alignItems="center" spacing={0.75}>
                                                        <Typography sx={{ fontWeight: 900, color: contrastText, fontSize: "1rem", lineHeight: 1.2 }} noWrap>
                                                            {customerName ? `${customerName}'s Cart` : `Cart #${cart.id}`}
                                                        </Typography>

                                                        {/* Subtle Business Indicator */}
                                                        {cart.customer?.active_pricing_customer_type === 'business' && (
                                                            <StorefrontRoundedIcon
                                                                sx={{
                                                                    fontSize: '1rem',
                                                                    color: contrastText,
                                                                    opacity: 0.5 // Keeps it very subtle
                                                                }}
                                                                titleAccess="Business Customer"
                                                            />
                                                        )}
                                                    </Stack>
                                                    <Typography variant="body2" sx={{ color: subtextOpacity, fontWeight: 600, mt: 0.2 }} noWrap>
                                                        {sellerLabel || "Unassigned"}
                                                    </Typography>
                                                </Box>

                                                <Stack alignItems="flex-end" spacing={0.5}>
                                                    <Chip label={`${cart.variants?.length ?? 0} items`} size="small" sx={{ bgcolor: "rgba(0,0,0,0.1)", color: contrastText, fontWeight: 800, fontSize: "0.7rem" }} />
                                                    <ChevronRightRoundedIcon sx={{ color: contrastText, opacity: 0.5 }} />
                                                </Stack>
                                            </Stack>
                                        </Box>
                                    </SortableCartRow>
                                );
                            })}
                        </Stack>
                    </SortableContext>
                </DndContext>

                {cartList.length === 0 && (
                    <Box sx={{ textAlign: "center", mt: 10, opacity: 0.5 }}>
                        <Typography variant="body1">No active carts found.</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout children={page} />;