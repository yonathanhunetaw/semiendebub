import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import PointOfSaleRoundedIcon from "@mui/icons-material/PointOfSaleRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import {
    Box,
    Button,
    Divider,
    Grid,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import React from "react";

interface SellerVariant {
    id: number;
}

interface SellerItem {
    id: number;
    product_name: string;
    status?: string;
    variants?: SellerVariant[];
}

interface SellerStore {
    id?: number;
    store_name?: string;
    name?: string;
}

export default function Index({
    items = [],
    store,
}: {
    items?: SellerItem[];
    store?: SellerStore | null;
}) {
    const activeItems = items.filter((item) => item.status === "active").length;
    const totalVariants = items.reduce(
        (count, item) => count + (item.variants?.length ?? 0),
        0,
    );

    return (
        <>
            <Head title="Seller Dashboard" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Seller Dashboard
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {store?.store_name || store?.name || "Your store"} catalog, pricing, and order flow at a glance.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <StorefrontRoundedIcon color="primary" />
                            <Typography variant="overline" color="text.secondary">
                                Live Catalog
                            </Typography>
                        </Stack>
                        <Typography variant="h4" sx={{ mt: 2, fontWeight: 800 }}>
                            {items.length}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Inventory2RoundedIcon color="primary" />
                            <Typography variant="overline" color="text.secondary">
                                Active Listings
                            </Typography>
                        </Stack>
                        <Typography variant="h4" sx={{ mt: 2, fontWeight: 800 }}>
                            {activeItems}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <PointOfSaleRoundedIcon color="primary" />
                            <Typography variant="overline" color="text.secondary">
                                Variants Ready
                            </Typography>
                        </Stack>
                        <Typography variant="h4" sx={{ mt: 2, fontWeight: 800 }}>
                            {totalVariants}
                        </Typography>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 7 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Catalog Snapshot
                            </Typography>
                            <Button component={Link} href={route("seller.items.index")} variant="outlined" sx={{ borderRadius: 3, textTransform: "none" }}>
                                Open Catalog
                            </Button>
                        </Stack>
                        <Divider sx={{ mb: 2 }} />
                        <List disablePadding>
                            {items.slice(0, 8).map((item) => (
                                <ListItem key={item.id} disableGutters divider>
                                    <ListItemText
                                        primary={item.product_name}
                                        secondary={`${item.variants?.length ?? 0} variants`}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            Quick Actions
                        </Typography>
                        <Stack spacing={1.5}>
                            <Button component={Link} href={route("seller.orders.index")} variant="contained" sx={{ borderRadius: 3, textTransform: "none" }}>
                                Review Orders
                            </Button>
                            <Button component={Link} href={route("seller.customers.index")} variant="outlined" sx={{ borderRadius: 3, textTransform: "none" }}>
                                View Customers
                            </Button>
                            <Button component={Link} href={route("seller.settings.index")} variant="outlined" sx={{ borderRadius: 3, textTransform: "none" }}>
                                Seller Settings
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
