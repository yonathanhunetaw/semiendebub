import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import {
    Avatar,
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    useTheme,
} from "@mui/material";

interface Item {
    id: number;
    product_name: string;
    status: "active" | "inactive" | "unavailable" | "draft" | "archived";
    variants_count: number;
    active_variants_count: number;
    processed_images?: string[];
}

interface Props {
    items: Item[];
    filters: {
        filter: string;
        sort: string;
        direction: "asc" | "desc";
    };
}

const statusOptions = ["all", "active", "inactive", "unavailable", "draft"];

const sortIcon = (filters: Props["filters"]) =>
    filters.direction === "asc" ? (
        <ArrowUpwardIcon fontSize="small" />
    ) : (
        <ArrowDownwardIcon fontSize="small" />
    );

export default function ItemIndex({ items, filters }: Props) {
    const theme = useTheme();
    
    const updateParams = (newParams: Record<string, string>) => {
        router.get(
            route("admin.items.index"),
            { ...filters, ...newParams },
            { preserveState: true, preserveScroll: true },
        );
    };

    const ImageStrip = ({ images = [] }: { images?: string[] }) => (
        <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
            {Array.from({ length: 5 }).map((_, index) => {
                const image = images[index];

                return (
                    <Avatar
                        key={`${image ?? "empty"}-${index}`}
                        src={image || "/images/defaults/no-image.png"}
                        variant="rounded"
                        sx={{
                            width: 42,
                            height: 42,
                            bgcolor: "#272727", 
                            border: "1px solid",
                            borderColor: "divider",
                            opacity: image ? 1 : 0.3,
                        }}
                    />
                );
            })}
        </Stack>
    );

    return (
        <Box sx={{ p: 0 }}>
            <Head title="Items Management" />
            
            {/* Remove the test H1 - it's not needed anymore */}
            
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                mb={3}
            >
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        Items
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Physical product templates and their generated variant sets.
                    </Typography>
                </Box>

                <Button
                    component={Link}
                    href={route("admin.items.create")}
                    variant="contained"
                    startIcon={<AddIcon />}
                    sx={{
                        borderRadius: "10px",
                        textTransform: "none",
                        fontWeight: 700,
                    }}
                >
                    Add Item
                </Button>
            </Stack>

            <Paper
                elevation={0}
                sx={{
                    p: 2,
                    mb: 3,
                    borderRadius: "12px",
                    border: "1px solid",
                    borderColor: "divider",
                }}
            >
                <Typography
                    variant="subtitle2"
                    gutterBottom
                    sx={{
                        textTransform: "uppercase",
                        color: "text.secondary",
                        fontWeight: 700,
                    }}
                >
                    Filter by Status
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {statusOptions.map((option) => (
                        <Chip
                            key={option}
                            label={option.toUpperCase()}
                            onClick={() => updateParams({ filter: option })}
                            color={filters.filter === option ? "primary" : "default"}
                            variant={filters.filter === option ? "filled" : "outlined"}
                            sx={{ cursor: "pointer", fontWeight: 600 }}
                        />
                    ))}
                </Stack>
            </Paper>

            {/* Mobile View */}
            <Box sx={{ display: { xs: "grid", md: "none" }, gap: 2 }}>
                {items.length > 0 ? (
                    items.map((item) => (
                        <Paper
                            key={item.id}
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: "12px",
                                border: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            <Stack spacing={2}>
                                <ImageStrip images={item.processed_images} />
                                <Box>
                                    <Typography variant="subtitle1" fontWeight={700}>
                                        {item.product_name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {item.status.toUpperCase()}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                        label={`${item.variants_count} Variants`}
                                        size="small"
                                        color="info"
                                        variant="outlined"
                                    />
                                    <Chip
                                        label={`${item.active_variants_count} Active in Stores`}
                                        size="small"
                                        color="success"
                                        variant="outlined"
                                    />
                                </Stack>
                                <Button
                                    component={Link}
                                    href={route("admin.items.show", item.id)}
                                    variant="outlined"
                                    sx={{
                                        alignSelf: "flex-start",
                                        textTransform: "none",
                                        fontWeight: 700,
                                        // FIX: Make button visible in dark mode
                                        color: theme.palette.mode === 'dark' ? '#fff' : 'inherit',
                                        borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.5)' : undefined,
                                        '&:hover': {
                                            borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.8)' : undefined,
                                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : undefined,
                                        }
                                    }}
                                >
                                    View
                                </Button>
                            </Stack>
                        </Paper>
                    ))
                ) : (
                    <Paper elevation={0} sx={{ p: 4, borderRadius: "12px", border: "1px solid", borderColor: "divider" }}>
                        <Typography color="text.secondary">No items found.</Typography>
                    </Paper>
                )}
            </Box>

            {/* Desktop Table View */}
            <TableContainer
                component={Paper}
                elevation={0}
                sx={{
                    display: { xs: "none", md: "block" },
                    borderRadius: "16px",
                    border: "1px solid",
                    borderColor: "divider",
                }}
            >
                <Table>
                    <TableHead sx={{ bgcolor: "action.hover" }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={0.5}
                                    sx={{ cursor: "pointer" }}
                                    onClick={() =>
                                        updateParams({
                                            sort: "name",
                                            direction: filters.direction === "asc" ? "desc" : "asc",
                                        })
                                    }
                                >
                                    <span>Item</span>
                                    {filters.sort === "name" ? sortIcon(filters) : null}
                                </Stack>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Variants</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.length > 0 ? (
                            items.map((item) => (
                                <TableRow key={item.id} hover>
                                    <TableCell>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <ImageStrip images={item.processed_images} />
                                            <Box>
                                                <Typography variant="body1" fontWeight={700}>
                                                    {item.product_name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    5-image preview
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={item.status.toUpperCase()}
                                            size="small"
                                            color={item.status === "active" ? "success" : "default"}
                                            variant={item.status === "active" ? "filled" : "outlined"}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                            <Chip label={`${item.variants_count} Total`} size="small" color="info" variant="outlined" />
                                            <Chip label={`${item.active_variants_count} Active`} size="small" color="success" variant="outlined" />
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button
                                            component={Link}
                                            href={route("admin.items.show", item.id)}
                                            size="small"
                                            variant="outlined"
                                            sx={{ 
                                                textTransform: "none", 
                                                fontWeight: 700,
                                                // FIX: Make button visible in dark mode
                                                color: theme.palette.mode === 'dark' ? '#fff' : 'inherit',
                                                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.5)' : undefined,
                                                '&:hover': {
                                                    borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.8)' : undefined,
                                                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : undefined,
                                                }
                                            }}
                                        >
                                            View
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 5 }}>
                                    No items found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

ItemIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;