import { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
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
} from "@mui/material";
import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

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
}

interface Item {
    id: number;
    product_name: string;
    product_description: string;
    status: string;
    general_images: string[] | null;
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
}: {
    item: Item;
    variantData: VariantRow[];
}) {
    if (!item) return null;

    const allGeneralImages = item.general_images ?? [];
    const getImageUrl = (path: string) =>
        path.startsWith("http") ? path : `/storage/${path}`;

    // Initialize state with the ALREADY formatted URL of the first image
    const [selectedImage, setSelectedImage] = useState(
        allGeneralImages.length > 0
            ? getImageUrl(allGeneralImages[0])
            : (variantData[0]?.slots[0]?.url ?? "/img/default.jpg"),
    );
    const masterFallback =
        allGeneralImages[0] ??
        variantData[0]?.slots[0]?.url ??
        "/img/default.jpg";

    const [showAllThumbs, setShowAllThumbs] = useState(false);

    const displayedThumbs = showAllThumbs
        ? allGeneralImages
        : allGeneralImages.slice(0, 5);
    const proofComplete =
        variantData.length > 0 && variantData.every((v) => v.proof_ok);

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: "1440px", margin: "0 auto" }}>
            <Head title={`Catalog: ${item.product_name}`} />

            {/* ── Header ── */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 4 }}
            >
                <Box>
                    <Typography
                        variant="overline"
                        color="primary"
                        sx={{ fontWeight: 800, letterSpacing: 1 }}
                    >
                        Admin · Items
                    </Typography>
                    <Typography variant="h4" fontWeight={900}>
                        {item.product_name}
                    </Typography>
                    <Stack direction="row" spacing={1} mt={0.5}>
                        <Chip
                            size="small"
                            label={item.status.toUpperCase()}
                            color={statusColor(item.status)}
                        />
                        <Chip
                            size="small"
                            icon={
                                proofComplete ? (
                                    <CheckCircleIcon />
                                ) : (
                                    <ErrorOutlineIcon />
                                )
                            }
                            label={
                                proofComplete
                                    ? "All variants proven"
                                    : "Some variants need images"
                            }
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
                        }}
                    >
                        Edit Item
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddBusinessIcon />}
                        sx={{
                            borderRadius: 2,
                            fontWeight: "bold",
                            textTransform: "none",
                            px: 3,
                        }}
                    >
                        Deploy to Store
                    </Button>
                </Stack>
            </Stack>

            <Grid container spacing={4}>
                {/* ── Gallery ── */}
                <Grid item xs={12} md={5}>
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 2,
                            borderRadius: 4,
                            position: "sticky",
                            top: 24,
                        }}
                    >
                        {/* Main Image Container */}
                        <Box
                            sx={{
                                width: "100%",
                                aspectRatio: "1 / 1", // Forces a square shape (prevents narrow look)
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                mb: 2,
                                bgcolor: "background.default", // Uses your theme's dark/light color
                                borderRadius: 2,
                                overflow: "hidden",
                                border: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            <Box
                                component="img"
                                src={selectedImage}
                                sx={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain", // Keeps image proportions safe
                                }}
                                onError={(e: any) => {
                                    e.currentTarget.src = "/img/default.jpg";
                                }}
                            />
                        </Box>

                        {/* Thumbnail Header */}
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            mb={1}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    fontWeight: "bold",
                                    color: "text.secondary",
                                }}
                            >
                                GENERAL IMAGES ({allGeneralImages.length})
                            </Typography>
                            {allGeneralImages.length > 5 && (
                                <Button
                                    size="small"
                                    onClick={() =>
                                        setShowAllThumbs(!showAllThumbs)
                                    }
                                    endIcon={
                                        showAllThumbs ? (
                                            <KeyboardArrowLeftIcon />
                                        ) : (
                                            <ExpandMoreIcon />
                                        )
                                    }
                                    sx={{
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                    }}
                                >
                                    {showAllThumbs
                                        ? "Show Less"
                                        : `+${allGeneralImages.length - 5} More`}
                                </Button>
                            )}
                        </Stack>

                        {/* Thumbnails Container */}
                        <Box
                            sx={{
                                display: "flex",
                                flexWrap: showAllThumbs ? "wrap" : "nowrap",
                                gap: 1.5,
                                overflowX: showAllThumbs ? "unset" : "auto",
                                pb: 1,
                                // Hide scrollbar but allow swiping on mobile
                                "&::-webkit-scrollbar": { height: 4 },
                                "&::-webkit-scrollbar-thumb": {
                                    bgcolor: "divider",
                                    borderRadius: 8,
                                },
                            }}
                        >
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
                                            minWidth: 64, // Prevents the 'squashed' look in flex-nowrap
                                            borderRadius: 1.5,
                                            cursor: "pointer",
                                            border: "2px solid",
                                            borderColor:
                                                selectedImage === src
                                                    ? "primary.main"
                                                    : "transparent",
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
                </Grid>

                {/* ── Variants ── */}
                <Grid item xs={12} md={7}>
                    <Typography variant="h6" fontWeight={800} gutterBottom>
                        Description
                    </Typography>
                    <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mb: 4, lineHeight: 1.6 }}
                    >
                        {item.product_description || "No description provided."}
                    </Typography>

                    <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
                        Variants & Visual Proof ({variantData.length})
                    </Typography>

                    <Stack spacing={3}>
                        {variantData.map((variant) => (
                            <Paper
                                key={variant.id}
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    borderColor: variant.proof_ok
                                        ? "success.main"
                                        : "warning.main",
                                    borderWidth: 1.5,
                                }}
                            >
                                {/* Variant header */}
                                <Stack
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="flex-start"
                                    mb={1.5}
                                >
                                    <Box>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                            flexWrap="wrap"
                                        >
                                            <Typography
                                                variant="subtitle1"
                                                fontWeight={800}
                                            >
                                                {[
                                                    variant.color,
                                                    variant.size,
                                                    variant.packaging,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" / ") || "Default"}
                                            </Typography>
                                            <Chip
                                                size="small"
                                                label={variant.status.toUpperCase()}
                                                color={statusColor(
                                                    variant.status,
                                                )}
                                            />
                                            {variant.proof_ok ? (
                                                <Chip
                                                    size="small"
                                                    icon={<CheckCircleIcon />}
                                                    label="Proof OK"
                                                    color="success"
                                                />
                                            ) : (
                                                <Chip
                                                    size="small"
                                                    icon={<ErrorOutlineIcon />}
                                                    label={`Need ${2 - variant.slot_count} more image${2 - variant.slot_count !== 1 ? "s" : ""}`}
                                                    color="warning"
                                                />
                                            )}
                                        </Stack>
                                        {variant.sku && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    fontFamily: "monospace",
                                                    color: "text.secondary",
                                                }}
                                            >
                                                SKU: {variant.sku}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Typography
                                        variant="caption"
                                        color="text.disabled"
                                    >
                                        {variant.slot_count} / 5
                                    </Typography>
                                </Stack>

                                {/* 5 image slots */}
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    flexWrap="wrap"
                                    useFlexGap
                                    mb={2}
                                >
                                    {Array.from({ length: 5 }).map(
                                        (_, slotIndex) => {
                                            const slot =
                                                variant.slots[slotIndex];
                                            return (
                                                <Box
                                                    key={slotIndex}
                                                    onMouseEnter={() =>
                                                        slot &&
                                                        setSelectedImage(
                                                            slot.url,
                                                        )
                                                    }
                                                    onMouseLeave={() =>
                                                        setSelectedImage(
                                                            masterFallback,
                                                        )
                                                    }
                                                >
                                                    {slot ? (
                                                        <Box sx={{ width: 80 }}>
                                                            <Box
                                                                component="img"
                                                                src={slot.url}
                                                                onError={(
                                                                    e: any,
                                                                ) => {
                                                                    e.currentTarget.src =
                                                                        "/img/default.jpg";
                                                                }}
                                                                onClick={() =>
                                                                    setSelectedImage(
                                                                        slot.url,
                                                                    )
                                                                }
                                                                sx={{
                                                                    width: 80,
                                                                    height: 80,
                                                                    objectFit:
                                                                        "cover",
                                                                    borderRadius: 1.5,
                                                                    border: "1px solid",
                                                                    borderColor:
                                                                        "divider",
                                                                    cursor: "pointer",
                                                                    display:
                                                                        "block",
                                                                }}
                                                            />
                                                            {/* Filename */}
                                                            <Tooltip
                                                                title={
                                                                    slot.path
                                                                }
                                                                arrow
                                                                placement="bottom"
                                                            >
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{
                                                                        display:
                                                                            "block",
                                                                        fontSize:
                                                                            "0.55rem",
                                                                        color: "text.disabled",
                                                                        mt: 0.5,
                                                                        maxWidth: 80,
                                                                        overflow:
                                                                            "hidden",
                                                                        textOverflow:
                                                                            "ellipsis",
                                                                        whiteSpace:
                                                                            "nowrap",
                                                                        fontFamily:
                                                                            "monospace",
                                                                    }}
                                                                >
                                                                    {slot.path
                                                                        .split(
                                                                            "/",
                                                                        )
                                                                        .pop()}
                                                                </Typography>
                                                            </Tooltip>
                                                            <IconButton
                                                                size="small"
                                                                component="a"
                                                                href={slot.url}
                                                                target="_blank"
                                                                sx={{ p: 0.25 }}
                                                            >
                                                                <OpenInNewIcon
                                                                    sx={{
                                                                        fontSize: 12,
                                                                        color: "text.disabled",
                                                                    }}
                                                                />
                                                            </IconButton>
                                                        </Box>
                                                    ) : (
                                                        <Box
                                                            sx={{
                                                                width: 80,
                                                                height: 80,
                                                                borderRadius: 1.5,
                                                                border: "2px dashed",
                                                                borderColor:
                                                                    slotIndex <
                                                                    2
                                                                        ? "warning.main"
                                                                        : "divider",
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                justifyContent:
                                                                    "center",
                                                                bgcolor:
                                                                    slotIndex <
                                                                    2
                                                                        ? "rgba(237,108,2,0.04)"
                                                                        : "background.default",
                                                            }}
                                                        >
                                                            <Typography
                                                                variant="caption"
                                                                color={
                                                                    slotIndex <
                                                                    2
                                                                        ? "warning.main"
                                                                        : "text.disabled"
                                                                }
                                                                sx={{
                                                                    fontSize:
                                                                        "0.6rem",
                                                                }}
                                                            >
                                                                {slotIndex + 1}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </Box>
                                            );
                                        },
                                    )}
                                </Stack>

                                {/* Storage paths table */}
                                {variant.slots.length > 0 && (
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            color="text.disabled"
                                            fontWeight={700}
                                            sx={{
                                                textTransform: "uppercase",
                                                letterSpacing: "0.06em",
                                                display: "block",
                                                mb: 0.5,
                                            }}
                                        >
                                            Storage Paths
                                        </Typography>
                                        <TableContainer
                                            component={Paper}
                                            variant="outlined"
                                            sx={{ borderRadius: 1 }}
                                        >
                                            <Table size="small">
                                                <TableHead
                                                    sx={{
                                                        bgcolor: "action.hover",
                                                    }}
                                                >
                                                    <TableRow>
                                                        <TableCell
                                                            sx={{
                                                                fontWeight: 700,
                                                                py: 0.5,
                                                                fontSize:
                                                                    "0.7rem",
                                                                width: 32,
                                                            }}
                                                        >
                                                            #
                                                        </TableCell>
                                                        <TableCell
                                                            sx={{
                                                                fontWeight: 700,
                                                                py: 0.5,
                                                                fontSize:
                                                                    "0.7rem",
                                                            }}
                                                        >
                                                            storage/ path
                                                        </TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {variant.slots.map(
                                                        (slot, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell
                                                                    sx={{
                                                                        py: 0.5,
                                                                        fontSize:
                                                                            "0.7rem",
                                                                        color: "text.disabled",
                                                                    }}
                                                                >
                                                                    {i + 1}
                                                                </TableCell>
                                                                <TableCell
                                                                    sx={{
                                                                        py: 0.5,
                                                                    }}
                                                                >
                                                                    <Typography
                                                                        variant="caption"
                                                                        sx={{
                                                                            fontFamily:
                                                                                "monospace",
                                                                            fontSize:
                                                                                "0.65rem",
                                                                            color: "text.secondary",
                                                                            wordBreak:
                                                                                "break-all",
                                                                        }}
                                                                    >
                                                                        {
                                                                            slot.path
                                                                        }
                                                                    </Typography>
                                                                </TableCell>
                                                            </TableRow>
                                                        ),
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Box>
                                )}
                            </Paper>
                        ))}
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}

Show.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
