import { SELLER_BRAND_DARK, SellerCard } from "@/Components/Seller/sellerUi";
import { Box, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React from "react";
import { NO_IMAGE_PLACEHOLDER } from "./itemShowHelpers";

export interface ItemImageGalleryProps {
    productName: string;
    images: string[];
    activeImage: string | null;
    onSelectImage: (image: string) => void;
    onOpenViewer: () => void;
}

export default function ItemImageGallery({
    productName,
    images,
    activeImage,
    onSelectImage,
    onOpenViewer,
}: ItemImageGalleryProps) {
    const theme = useTheme();

    return (
        <SellerCard sx={{ p: 0, overflow: "hidden" }}>
            <Box
                sx={{
                    height: 280,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                        theme.palette.mode === "dark" ? "#1a1a1a" : "#fff7ed",
                    cursor: activeImage ? "zoom-in" : "default",
                }}
                onClick={() => activeImage && onOpenViewer()}
            >
                <Box
                    component="img"
                    src={activeImage || NO_IMAGE_PLACEHOLDER}
                    alt={productName}
                    onError={(e) => {
                        e.currentTarget.src = NO_IMAGE_PLACEHOLDER;
                    }}
                    sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                    }}
                />
            </Box>

            {images.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ p: 1.5, overflowX: "auto" }}>
                    {images.map((image) => (
                        <Box
                            key={image}
                            component="button"
                            type="button"
                            onClick={() => onSelectImage(image)}
                            sx={{
                                width: 64,
                                height: 64,
                                p: 0,
                                border:
                                    activeImage === image
                                        ? `2px solid ${SELLER_BRAND_DARK}`
                                        : "1px solid rgba(148, 163, 184, 0.24)",
                                borderRadius: 2,
                                overflow: "hidden",
                                background: theme.palette.mode === "dark" ? "#333" : "#fff",
                                flexShrink: 0,
                                cursor: "pointer",
                                transition: "all 0.2s",
                                "&:hover": {
                                    transform: "scale(1.05)",
                                },
                            }}
                        >
                            <Box
                                component="img"
                                src={image}
                                alt={productName}
                                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                    e.currentTarget.src = NO_IMAGE_PLACEHOLDER;
                                }}
                                loading="eager"
                                sx={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                }}
                            />
                        </Box>
                    ))}
                </Stack>
            )}
        </SellerCard>
    );
}
