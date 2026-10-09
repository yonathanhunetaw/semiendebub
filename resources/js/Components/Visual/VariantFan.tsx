import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import Scene from "./scenes";
import { motionSafe, pop } from "./motion";

/**
 * One item and its variants: the same product, split by colour, size and
 * pack. The item sits on the left; each variant fans out as a card with a
 * swatch for its colour (when the colour name is one the browser knows).
 */

export interface FanVariant {
    key: string | number;
    label?: string | null;
    color?: string | null;
    size?: string | null;
    pack?: string | null;
    sku?: string | null;
    active?: boolean;
}

function swatch(color: string | null | undefined): string | null {
    if (!color || typeof CSS === "undefined" || typeof CSS.supports !== "function") return null;
    const name = color.trim().toLowerCase().replace(/\s+/g, "");
    return CSS.supports("color", name) ? name : null;
}

export default function VariantFan({ item, variants, max = 8 }: { item: string; variants: FanVariant[]; max?: number }) {
    const theme = useTheme();
    const shown = variants.slice(0, max);
    const more = variants.length - shown.length;

    return (
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "stretch", sm: "center" }, gap: 2, ...motionSafe }}>
            <Stack direction={{ xs: "row", sm: "column" }} alignItems="center" spacing={1} sx={{ flexShrink: 0, width: { sm: 120 }, textAlign: { sm: "center" } }}>
                <Scene kind="parcel" size={56} title={item} />
                <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: "0.9rem", lineHeight: 1.2 }}>{item}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {variants.length} variant{variants.length === 1 ? "" : "s"}
                    </Typography>
                </Box>
            </Stack>

            <Box
                sx={{
                    position: "relative",
                    flex: 1,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
                    gap: 1,
                    pl: { sm: 2 },
                    // The fan's spine.
                    "&::before": { content: '""', display: { xs: "none", sm: "block" }, position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.35) },
                }}
            >
                {shown.map((variant, index) => {
                    const dot = swatch(variant.color);

                    return (
                        <Box
                            key={variant.key}
                            sx={{
                                position: "relative",
                                p: 1.25,
                                borderRadius: 2,
                                border: "1px solid",
                                borderColor: "divider",
                                bgcolor: "background.paper",
                                opacity: variant.active === false ? 0.55 : 1,
                                animation: `${pop} .45s ease-out both`,
                                animationDelay: `${index * 70}ms`,
                            }}
                        >
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Box sx={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: "2px solid", borderColor: "divider", bgcolor: dot ?? alpha(theme.palette.primary.main, 0.2) }} />
                                <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.8rem" }}>{variant.color ?? variant.label ?? "Standard"}</Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                                {[variant.size, variant.pack].filter(Boolean).map((tag) => (
                                    <Box key={tag as string} component="span" sx={{ px: 0.75, py: 0.25, borderRadius: 1, bgcolor: "action.hover", fontSize: "0.7rem", fontWeight: 600 }}>
                                        {tag}
                                    </Box>
                                ))}
                            </Stack>
                            {variant.sku && (
                                <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary", fontFamily: "monospace", fontSize: "0.65rem" }} noWrap>
                                    {variant.sku}
                                </Typography>
                            )}
                        </Box>
                    );
                })}
                {more > 0 && (
                    <Box sx={{ p: 1.25, borderRadius: 2, border: "1px dashed", borderColor: "divider", display: "grid", placeItems: "center" }}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>+{more} more</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
