import { SellerCard } from "@/Components/Seller/sellerUi";
import { Box, Stack } from "@mui/material";
import React from "react";
import PackagingPlaceholder from "@/Components/Shared/PackagingPlaceholder";
import { NO_IMAGE_PLACEHOLDER } from "./itemShowHelpers";

export interface ItemImageGalleryProps {
    productName: string;
    images: string[];
    activeImage: string | null;
    /** Packaging of the selected variant, for the no-photograph fallback. */
    packaging?: string | null;
    onSelectImage: (image: string) => void;
    onOpenViewer: () => void;
}

export default function ItemImageGallery({
    productName,
    images,
    activeImage,
    packaging,
    onSelectImage,
    onOpenViewer,
}: ItemImageGalleryProps) {
    return (
        <SellerCard sx={{ p: 0, overflow: "hidden" }}>
            <Box
                sx={{
                    height: 280,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgb(var(--primary-container) / 0.6)",
                    cursor: activeImage ? "zoom-in" : "default",
                }}
                onClick={() => activeImage && onOpenViewer()}
            >
                {activeImage ? (
                    <Box
                        component="img"
                        src={activeImage}
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
                ) : (
                    <PackagingPlaceholder
                        packaging={packaging}
                        label={productName}
                        size="lg"
                        className="border-0 bg-transparent"
                    />
                )}
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
                                        ? "2px solid rgb(var(--primary))"
                                        : "1px solid rgb(var(--outline) / 0.24)",
                                borderRadius: 2,
                                overflow: "hidden",
                                bgcolor: "rgb(var(--surface-bright))",
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
