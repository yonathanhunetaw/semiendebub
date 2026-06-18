import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import { Box, Dialog, IconButton, Typography } from "@mui/material";
import { NO_IMAGE_PLACEHOLDER } from "./itemShowHelpers";

export interface ImageViewerDialogProps {
    open: boolean;
    onClose: () => void;
    productName: string;
    activeImage: string | null;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    // Optional thumbnail strip (used for the variant image viewer; omit for
    // the simple main-product viewer)
    thumbnails?: string[];
    displayedThumbnails?: string[];
    selectedThumbnail?: string | null;
    onSelectThumbnail?: (image: string) => void;
    showAllThumbs?: boolean;
    onToggleShowAllThumbs?: () => void;
}

export default function ImageViewerDialog({
    open,
    onClose,
    productName,
    activeImage,
    zoom,
    onZoomChange,
    thumbnails,
    displayedThumbnails,
    selectedThumbnail,
    onSelectThumbnail,
    showAllThumbs,
    onToggleShowAllThumbs,
}: ImageViewerDialogProps) {
    const hasThumbnailStrip = thumbnails && thumbnails.length > 0;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen
            PaperProps={{
                sx: { bgcolor: "#000", display: "flex", flexDirection: "column" },
            }}
        >
            {/* Toolbar */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: hasThumbnailStrip ? "space-between" : "flex-end",
                    alignItems: "center",
                    p: 2,
                }}
            >
                {hasThumbnailStrip && onToggleShowAllThumbs && (
                    <IconButton onClick={onToggleShowAllThumbs} sx={{ color: "#fff" }}>
                        {showAllThumbs ? "Show Less" : "Show All"}
                    </IconButton>
                )}
                <Box sx={{ display: "flex", gap: 2 }}>
                    <IconButton
                        onClick={() => onZoomChange(Math.max(0.5, zoom - 0.25))}
                        sx={{ color: "#fff" }}
                    >
                        <ZoomOutRoundedIcon />
                    </IconButton>
                    <Typography sx={{ color: "#fff", alignSelf: "center" }}>
                        {Math.round(zoom * 100)}%
                    </Typography>
                    <IconButton
                        onClick={() => onZoomChange(Math.min(3, zoom + 0.25))}
                        sx={{ color: "#fff" }}
                    >
                        <ZoomInRoundedIcon />
                    </IconButton>
                </Box>
                <IconButton onClick={onClose} sx={{ color: "#fff" }}>
                    <CloseRoundedIcon />
                </IconButton>
            </Box>

            {/* Thumbnail strip */}
            {hasThumbnailStrip && displayedThumbnails && onSelectThumbnail && (
                <Box
                    sx={{
                        display: "flex",
                        flexWrap: showAllThumbs ? "wrap" : "nowrap",
                        gap: 1.5,
                        overflowX: showAllThumbs ? "unset" : "auto",
                        pb: 1,
                        px: 2,
                    }}
                >
                    {displayedThumbnails.map((img, i) => (
                        <Box
                            key={i}
                            component="img"
                            src={img}
                            onClick={() => onSelectThumbnail(img)}
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                e.currentTarget.src = NO_IMAGE_PLACEHOLDER;
                            }}
                            sx={{
                                width: 64,
                                height: 64,
                                minWidth: 64,
                                borderRadius: 1.5,
                                cursor: "pointer",
                                border: "2px solid",
                                borderColor:
                                    selectedThumbnail === img
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
                    ))}
                </Box>
            )}

            {/* Zoomable image */}
            <Box
                sx={{
                    flex: 1,
                    overflow: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
                onDoubleClick={() => onZoomChange(zoom < 2 ? 2 : 1)}
            >
                <Box
                    component="img"
                    src={activeImage || NO_IMAGE_PLACEHOLDER}
                    alt={productName}
                    onError={(e) => {
                        e.currentTarget.src = NO_IMAGE_PLACEHOLDER;
                    }}
                    sx={{
                        maxWidth: hasThumbnailStrip ? "none" : "100%",
                        width: hasThumbnailStrip ? `${zoom * 100}%` : undefined,
                        maxHeight: !hasThumbnailStrip || zoom === 1 ? "100%" : "none",
                        objectFit: "contain",
                        transition: "width 0.2s ease",
                    }}
                />
            </Box>
        </Dialog>
    );
}
