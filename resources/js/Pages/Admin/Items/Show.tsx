import React, { useState, useMemo } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    useTheme,
    useMediaQuery,
} from "@mui/material";
import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InventoryIcon from "@mui/icons-material/Inventory";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import StorefrontIcon from "@mui/icons-material/Storefront";
import WarningIcon from "@mui/icons-material/Warning";
import CloseIcon from "@mui/icons-material/Close";

interface PackagingItem {
    name: string;
    pivot: {
        quantity: number;
        cbm: number;
    };
}

interface ImageSlotData {
    path: string;
    url: string;
}

interface VariantRow {
    id: number;
    sku: string | null;
    color: string | null;
    size: string | null;
    packaging: string | null;
    status: string;
    slots: ImageSlotData[];
    slot_count: number;
    proof_ok: boolean;
    packaging_data: PackagingItem[];
}

interface Item {
    id: number;
    product_name: string;
    product_description: string;
    status: string;
    general_images: string[] | null;
}

interface Store {
    id: number;
    name: string;
    location?: string | null;
    is_active: boolean;
    already_deployed: boolean;
}

const statusColor = (s: string): "success" | "warning" | "default" | "error" =>
    s === "active"
        ? "success"
        : s === "draft"
            ? "warning"
            : s === "inactive"
                ? "default"
                : "error";

export default function Show({
    item,
    variantData,
    stores = [],
}: {
    item: Item;
    variantData: VariantRow[];
    stores?: Store[];
}) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const [mobileImageViewerOpen, setMobileImageViewerOpen] = useState(false);

    // Safety check
    if (!item || !item.id) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="error">Error: Item data is missing or invalid.</Typography>
                <Button onClick={() => window.location.reload()} sx={{ mt: 2 }}>
                    Reload Page
                </Button>
            </Box>
        );
    }

    const getVariantDisplayText = (variant: VariantRow): string => {
        const parts = [];
        if (variant.color) parts.push(variant.color);
        if (variant.size) parts.push(variant.size);
        if (variant.packaging && typeof variant.packaging === 'string' && variant.packaging !== 'null') {
            parts.push(variant.packaging);
        }
        return parts.length > 0 ? parts.join(" / ") : "Default";
    };

    const allGeneralImages = item.general_images ?? [];

    const getImageUrl = (path: string | null | undefined): string => {
        if (!path) return "/img/default.jpg";
        return path;
    };

    const masterFallback = useMemo(() => {
        if (allGeneralImages.length > 0) return getImageUrl(allGeneralImages[0]);
        const firstVariantWithSlot = variantData.find(v => v.slots?.length > 0);
        if (firstVariantWithSlot?.slots[0]?.url) return firstVariantWithSlot.slots[0].url;
        return "/img/default.jpg";
    }, [allGeneralImages, variantData]);

    const [selectedImage, setSelectedImage] = useState(masterFallback);
    const [showAllThumbs, setShowAllThumbs] = useState(false);
    const [deployOpen, setDeployOpen] = useState(false);
    const [deployingToId, setDeployingToId] = useState<number | null>(null);

    const handleDeploy = (storeId: number) => {
        setDeployingToId(storeId);
        router.post(
            route("admin.items.deploy", item.id),
            { store_id: storeId },
            {
                preserveScroll: true,
                onFinish: () => {
                    setDeployingToId(null);
                    setDeployOpen(false);
                },
            },
        );
    };

    const displayedThumbs = showAllThumbs
        ? allGeneralImages
        : allGeneralImages.slice(0, 5);

    const proofComplete = variantData.length > 0 && variantData.every((v) => v.proof_ok);

    // FIXED: Safe formatCBM function that handles strings, nulls, undefined
    const formatCBM = (cbm: any): string => {
        if (cbm === null || cbm === undefined) return "N/A";

        // Convert string to number if needed
        let numValue = typeof cbm === 'string' ? parseFloat(cbm) : cbm;

        // Check if it's a valid number
        if (isNaN(numValue)) return "N/A";

        return `${numValue.toFixed(3)} m³`;
    };

    // Image Viewer Component
    const ImageViewer = () => (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                borderRadius: 4,
                position: isMobile ? 'relative' : 'sticky',
                top: isMobile ? 0 : 24,
            }}
        >
            <Box
                sx={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                    bgcolor: "background.default",
                    borderRadius: 2,
                    overflow: "hidden",
                    border: "1px solid",
                    borderColor: "divider",
                    cursor: isMobile ? 'pointer' : 'default',
                }}
                onClick={() => isMobile && setMobileImageViewerOpen(true)}
            >
                <Box
                    component="img"
                    src={selectedImage}
                    sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                    }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        e.currentTarget.src = "/img/default.jpg";
                    }}
                />
            </Box>

            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" sx={{ fontWeight: "bold", color: "text.secondary" }}>
                    GENERAL IMAGES ({allGeneralImages.length})
                </Typography>
                {allGeneralImages.length > 5 && (
                    <Button size="small" onClick={() => setShowAllThumbs(!showAllThumbs)} endIcon={
                        showAllThumbs ? <KeyboardArrowLeftIcon /> : <ExpandMoreIcon />
                    }>
                        {showAllThumbs ? "Show Less" : `+${allGeneralImages.length - 5} More`}
                    </Button>
                )}
            </Stack>

            <Box sx={{
                display: "flex",
                flexWrap: showAllThumbs ? "wrap" : "nowrap",
                gap: 1.5,
                overflowX: showAllThumbs ? "unset" : "auto",
                pb: 1,
            }}>
                {displayedThumbs.map((img, i) => {
                    const src = getImageUrl(img);
                    return (
                        <Box
                            key={i}
                            component="img"
                            src={src}
                            onClick={() => setSelectedImage(src)}
                            sx={{
                                width: 64,
                                height: 64,
                                minWidth: 64,
                                borderRadius: 1.5,
                                cursor: "pointer",
                                border: "2px solid",
                                borderColor: selectedImage === src ? "primary.main" : "transparent",
                                bgcolor: "background.paper",
                                objectFit: "cover",
                                transition: "0.2s",
                                "&:hover": {
                                    transform: "scale(1.05)",
                                    borderColor: "primary.light",
                                },
                            }}
                        />
                    );
                })}
            </Box>
        </Paper>
    );

    // Mobile fullscreen image viewer modal
    const MobileImageViewerModal = () => (
        <Dialog
            open={mobileImageViewerOpen}
            onClose={() => setMobileImageViewerOpen(false)}
            fullScreen
            PaperProps={{ sx: { bgcolor: 'black' } }}
        >
            <IconButton
                onClick={() => setMobileImageViewerOpen(false)}
                sx={{ position: 'absolute', top: 16, right: 16, color: 'white', zIndex: 1 }}
            >
                <CloseIcon />
            </IconButton>
            <Box
                sx={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                onClick={() => setMobileImageViewerOpen(false)}
            >
                <Box
                    component="img"
                    src={selectedImage}
                    sx={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                    }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                        e.currentTarget.src = "/img/default.jpg";
                    }}
                />
            </Box>
        </Dialog>
    );

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: "1440px", margin: "0 auto" }}>
            <Head title={`Catalog: ${item.product_name}`} />

            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: 1 }}>
                        Admin · Items
                    </Typography>
                    <Typography variant="h4" fontWeight={900}>
                        {item.product_name}
                    </Typography>
                    <Stack direction="row" spacing={1} mt={0.5}>
                        <Chip size="small" label={item.status.toUpperCase()} color={statusColor(item.status)} />
                        <Chip
                            size="small"
                            icon={proofComplete ? <CheckCircleIcon /> : <ErrorOutlineIcon />}
                            label={proofComplete ? "All variants proven" : "Some variants need images"}
                            color={proofComplete ? "success" : "warning"}
                            variant="outlined"
                        />
                    </Stack>
                </Box>
                <Stack direction="row" spacing={1.5}>
                    <Button
                        variant="outlined"
                        startIcon={<EditIcon />}
                        component={Link}
                        href={route("admin.items.edit", item.id)}
                        sx={{
                            borderRadius: 2,
                            fontWeight: "bold",
                            textTransform: "none",
                            color: theme.palette.mode === 'dark' ? '#fff' : 'inherit',
                            borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : undefined,
                            '&:hover': {
                                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.5)' : undefined,
                                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : undefined,
                            }
                        }}
                    >
                        Edit Item
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddBusinessIcon />}
                        onClick={() => setDeployOpen(true)}
                        sx={{ borderRadius: 2, fontWeight: "bold", textTransform: "none", px: 3 }}
                    >
                        Deploy to Store
                    </Button>
                </Stack>
            </Stack>

            <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 5 }} sx={{ order: { xs: 2, md: 1 } }}>
                    <ImageViewer />
                    {isMobile && <MobileImageViewerModal />}
                </Grid>

                <Grid size={{ xs: 12, md: 7 }} sx={{ order: { xs: 1, md: 2 } }}>
                    <Typography variant="h6" fontWeight={800} gutterBottom>
                        Description
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
                        {item.product_description || "No description provided."}
                    </Typography>

                    <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
                        Variants & Visual Proof ({variantData.length})
                    </Typography>

                    <Stack spacing={3}>
                        {variantData.map((variant) => {
                            // Filter packaging data to only this variant's packaging type
                            const packagingList = React.useMemo(() => {
                                const allPackaging = variant.packaging_data ?? [];

                                // Only show packaging that matches the variant's own packaging type
                                if (variant.packaging && variant.packaging !== 'null') {
                                    return allPackaging.filter(pkg => pkg.name === variant.packaging);
                                }

                                return allPackaging;
                            }, [variant.packaging, variant.packaging_data]);

                            const hasPackaging = packagingList.length > 0;
                            // ... rest of the componenta

                            return (
                                <Paper
                                    key={variant.id}
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 2,
                                        borderColor: variant.proof_ok ? "success.main" : "warning.main",
                                        borderWidth: 1.5,
                                    }}
                                >
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="flex-start"
                                        mb={1.5}
                                        flexWrap="wrap"
                                        gap={1}
                                    >
                                        <Box sx={{ flex: 1 }}>
                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                                                <Typography variant="subtitle1" fontWeight={800}>
                                                    {getVariantDisplayText(variant)}
                                                </Typography>
                                                <Chip size="small" label={variant.status.toUpperCase()} color={statusColor(variant.status)} />
                                                {variant.proof_ok ? (
                                                    <Chip size="small" icon={<CheckCircleIcon />} label="Proof OK" color="success" />
                                                ) : (
                                                    <Chip
                                                        size="small"
                                                        icon={<ErrorOutlineIcon />}
                                                        label={`Need ${Math.max(0, 2 - variant.slot_count)} more image${Math.max(0, 2 - variant.slot_count) !== 1 ? "s" : ""}`}
                                                        color="warning"
                                                    />
                                                )}
                                            </Stack>
                                            {variant.sku && (
                                                <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary", display: "block" }}>
                                                    SKU: {variant.sku}
                                                </Typography>
                                            )}
                                        </Box>
                                        <Typography variant="caption" color="text.disabled">
                                            {variant.slot_count} / 5 slots
                                        </Typography>
                                    </Stack>

                                    {hasPackaging && (
                                        <Box sx={{ mb: 2 }}>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                                <InventoryIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                                                <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary" }}>
                                                    Packaging Details
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                {packagingList.map((pkg, idx) => {
                                                    const quantity = pkg.pivot?.quantity ?? 0;
                                                    const cbm = pkg.pivot?.cbm ?? 0;
                                                    const displayText = `${pkg.name}: ${quantity} unit${quantity !== 1 ? "s" : ""} (${formatCBM(cbm)})`;

                                                    return (
                                                        <Tooltip key={idx} title={`Total volume: ${(quantity * Number(cbm) || 0).toFixed(3)} m³`} arrow>
                                                            <Chip
                                                                size="small"
                                                                icon={<InventoryIcon />}
                                                                label={displayText}
                                                                variant="outlined"
                                                                sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                                                            />
                                                        </Tooltip>
                                                    );
                                                })}
                                            </Stack>
                                        </Box>
                                    )}

                                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                        {Array.from({ length: 5 }).map((_, slotIndex) => {
                                            const slot = variant.slots?.[slotIndex];
                                            const isRequiredSlot = slotIndex < 2;

                                            return (
                                                <Box
                                                    key={slotIndex}
                                                    sx={{ position: "relative" }}
                                                    onMouseEnter={() => {
                                                        if (slot?.url) {
                                                            setSelectedImage(slot.url);
                                                        }
                                                    }}
                                                >
                                                    {slot?.url ? (
                                                        <Box sx={{ width: 80 }}>
                                                            <Box
                                                                component="img"
                                                                src={slot.url}
                                                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                                                    e.currentTarget.src = "/img/default.jpg";
                                                                }}
                                                                onClick={() => setSelectedImage(slot.url)}
                                                                sx={{
                                                                    width: 80,
                                                                    height: 80,
                                                                    objectFit: "cover",
                                                                    borderRadius: 1.5,
                                                                    border: "1px solid",
                                                                    borderColor: "divider",
                                                                    cursor: "pointer",
                                                                    display: "block",
                                                                }}
                                                            />
                                                            <Tooltip title={slot.path} arrow placement="bottom">
                                                                <Typography variant="caption" sx={{
                                                                    display: "block",
                                                                    fontSize: "0.55rem",
                                                                    color: "text.disabled",
                                                                    mt: 0.5,
                                                                    maxWidth: 80,
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    whiteSpace: "nowrap",
                                                                    fontFamily: "monospace",
                                                                    textAlign: "center",
                                                                }}>
                                                                    {slot.path.split("/").pop()}
                                                                </Typography>
                                                            </Tooltip>
                                                            <IconButton
                                                                size="small"
                                                                component="a"
                                                                href={slot.url}
                                                                target="_blank"
                                                                sx={{ p: 0.25, display: "block", mx: "auto", mt: 0.25 }}
                                                            >
                                                                <OpenInNewIcon sx={{ fontSize: 12, color: "text.disabled" }} />
                                                            </IconButton>
                                                        </Box>
                                                    ) : (
                                                        <Box
                                                            sx={{
                                                                width: 80,
                                                                height: 80,
                                                                borderRadius: 1.5,
                                                                border: "2px dashed",
                                                                borderColor: isRequiredSlot ? "warning.main" : "divider",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                bgcolor: isRequiredSlot ? "rgba(237,108,2,0.04)" : "background.default",
                                                                flexDirection: "column",
                                                                gap: 0.5,
                                                            }}
                                                        >
                                                            <Typography variant="caption" color={isRequiredSlot ? "warning.main" : "text.disabled"} sx={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                                                Slot {slotIndex + 1}
                                                            </Typography>
                                                            {isRequiredSlot && (
                                                                <Typography variant="caption" color="warning.main" sx={{ fontSize: "0.55rem" }}>
                                                                    Required
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    )}
                                                </Box>
                                            );
                                        })}
                                    </Stack>

                                    {variant.slots && variant.slots.length > 0 && (
                                        <Box>
                                            <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.06em", display: "block", mb: 0.5 }}>
                                                Storage Paths
                                            </Typography>
                                            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                                                <Table size="small">
                                                    <TableHead sx={{ bgcolor: "action.hover" }}>
                                                        <TableRow>
                                                            <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: "0.7rem", width: 40 }}>Slot</TableCell>
                                                            <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: "0.7rem" }}>Storage Path</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {variant.slots.map((slot, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell sx={{ py: 0.5, fontSize: "0.7rem", color: "text.disabled" }}>{i + 1}</TableCell>
                                                                <TableCell sx={{ py: 0.5 }}>
                                                                    <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: "0.65rem", color: "text.secondary", wordBreak: "break-all" }}>
                                                                        {slot.path}
                                                                    </Typography>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </Box>
                                    )}
                                </Paper>
                            );
                        })}
                    </Stack>
                </Grid>
            </Grid>

            <Dialog open={deployOpen} onClose={() => setDeployOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <StorefrontIcon color="primary" />
                        <span>Deploy to Store</span>
                    </Stack>
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Select a store to make <strong>{item.product_name}</strong> available.
                    </Typography>
                    {stores.length === 0 ? (
                        <Box sx={{ py: 4, textAlign: "center", color: "text.disabled" }}>
                            <StorefrontIcon sx={{ fontSize: 40, mb: 1 }} />
                            <Typography variant="body2">No active stores found.</Typography>
                        </Box>
                    ) : (
                        <List disablePadding>
                            {stores.map((store) => (
                                <ListItemButton
                                    key={store.id}
                                    disabled={store.already_deployed || deployingToId === store.id}
                                    onClick={() => handleDeploy(store.id)}
                                    sx={{
                                        borderRadius: 2,
                                        mb: 0.5,
                                        border: "1px solid",
                                        borderColor: store.already_deployed ? "success.main" : "divider",
                                        bgcolor: store.already_deployed ? "rgba(46,125,50,0.06)" : "background.paper",
                                    }}
                                >
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <span>{store.name}</span>
                                                {store.already_deployed && <Chip size="small" icon={<CheckCircleIcon />} label="Deployed" color="success" variant="outlined" />}
                                            </Stack>
                                        }
                                        secondary={store.location ?? undefined}
                                    />
                                    {!store.already_deployed && (
                                        <Button size="small" variant="contained" disabled={deployingToId === store.id} onClick={(e) => { e.stopPropagation(); handleDeploy(store.id); }}>
                                            {deployingToId === store.id ? "Deploying…" : "Deploy"}
                                        </Button>
                                    )}
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <Divider />
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setDeployOpen(false)}>Close</Button>
                    <Button component={Link} href="/inventory/stores" variant="outlined" startIcon={<StorefrontIcon />}>
                        Manage Stores
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;