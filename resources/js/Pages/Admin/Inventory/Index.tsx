import * as React from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Typography,
    Stack,
    Card,
    CardContent,
    Button,
    Chip,
    Divider,
    Paper
} from "@mui/material";
import {
    Storefront,
    Warehouse,
    ArrowForward,
    Inventory2,
    AddCircleOutline,
    LocationOn
} from "@mui/icons-material";
import { Grid as Grid } from "@mui/material";

// This interface matches the data structure we set up in the InventoryController
interface Store {
    id: number;
    name: string;
    type: 'retail' | 'warehouse';
    location_code: string;
    items_count: number;
}

interface Props {
    stores: Store[];
}

export default function InventoryIndex({ stores }: Props) {
    return (
        <Box sx={{ p: 3, maxWidth: 1400, margin: "0 auto" }}>
            <Head title="Inventory Hub" />

            {/* Header Section */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={2}
                mb={5}
            >
                <Box>
                    <Typography variant="h4" fontWeight={900} letterSpacing="-0.5px">
                        Inventory Hub
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage stock levels and distributions across your {stores.length} locations.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddCircleOutline />}
                    component={Link}
                    href={route('store.create')} // Using your existing Store route name
                    sx={{
                        borderRadius: '12px',
                        px: 3,
                        py: 1.5,
                        textTransform: 'none',
                        fontWeight: 700,
                        boxShadow: '0 4px 14px 0 rgba(0,118,255,0.39)'
                    }}
                >
                    Add New Location
                </Button>
            </Stack>

            {/* Stores Grid */}
            <Grid container spacing={3}>
                {stores.map((store) => (
                    <Grid item xs={12} sm={6} md={4} key={store.id}>
                        <Card
                            elevation={0}
                            sx={{
                                borderRadius: "16px",
                                border: "1px solid",
                                borderColor: "divider",
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    transform: 'translateY(-6px)',
                                    boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
                                    '& .arrow-icon': { transform: 'translateX(4px)' }
                                }
                            }}
                        >
                            <CardContent sx={{ p: 3 }}>
                                {/* Top Row: Icon and Code */}
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                                    <Box
                                        sx={{
                                            p: 1.5,
                                            bgcolor: store.type === 'warehouse' ? 'info.soft' : 'primary.soft',
                                            borderRadius: '12px',
                                            color: store.type === 'warehouse' ? 'info.main' : 'primary.main',
                                            display: 'flex',
                                            border: '1px solid',
                                            borderColor: 'inherit'
                                        }}
                                    >
                                        {store.type === 'warehouse' ? <Warehouse fontSize="medium" /> : <Storefront fontSize="medium" />}
                                    </Box>
                                    <Chip
                                        label={store.location_code}
                                        size="small"
                                        icon={<LocationOn sx={{ fontSize: '14px !important' }} />}
                                        sx={{
                                            fontWeight: 800,
                                            borderRadius: '8px',
                                            bgcolor: 'action.hover',
                                            border: '1px solid',
                                            borderColor: 'divider'
                                        }}
                                    />
                                </Stack>

                                {/* Store Info */}
                                <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>
                                    {store.name}
                                </Typography>

                                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'block', mb: 3 }}>
                                    {store.type === 'warehouse' ? 'Main Distribution Center' : 'Retail Outlet / Shop'}
                                </Typography>

                                <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

                                {/* Inventory Stats */}
                                <Stack direction="row" spacing={1.5} alignItems="center" mb={4}>
                                    <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                                        <Inventory2 fontSize="small" />
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" fontWeight={700} lineHeight={1}>
                                            {store.items_count} SKUs
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Unique products in stock
                                        </Typography>
                                    </Box>
                                </Stack>

                                {/* Action Button */}
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    component={Link}
                                    href={route('inventory.show', store.id)} // Points to your show route
                                    endIcon={<ArrowForward className="arrow-icon" sx={{ transition: '0.2s' }} />}
                                    sx={{
                                        borderRadius: '10px',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        py: 1.2,
                                        borderColor: 'divider',
                                        color: 'text.primary',
                                        '&:hover': {
                                            bgcolor: 'primary.main',
                                            color: 'white',
                                            borderColor: 'primary.main'
                                        }
                                    }}
                                >
                                    Manage Inventory
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}

                {/* Empty State Logic */}
                {stores.length === 0 && (
                    <Grid item xs={12}>
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 8,
                                textAlign: 'center',
                                borderRadius: '20px',
                                bgcolor: 'transparent',
                                borderStyle: 'dashed',
                                borderWidth: 2
                            }}
                        >
                            <Inventory2 sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                            <Typography variant="h6" fontWeight={700} color="text.secondary">
                                No locations found
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                You need to create a store or warehouse before you can manage inventory.
                            </Typography>
                            <Button
                                variant="contained"
                                component={Link}
                                href={route('store.create')}
                            >
                                Create Your First Store
                            </Button>
                        </Paper>
                    </Grid>
                )}
            </Grid>
        </Box>
    );
}

// Persistent Admin Layout
InventoryIndex.layout = (page: React.ReactNode) => <AdminLayout children={page} />;
