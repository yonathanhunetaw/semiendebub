import { SELLER_BRAND_DARK } from "@/Components/Seller/sellerUi";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
    PACKAGING_TIER_LABEL,
    type PackagingTier,
} from "./itemShowHelpers";

export interface PackagingTierOption {
    tier: PackagingTier;
    raw: string;
    /** Price for one unit of this tier (e.g. price per packet). */
    unitPrice: number | null;
    /** How many base pieces make up one unit of this tier. */
    unitsPerTier: number | null;
}

export interface PackagingSelectorProps {
    options: PackagingTierOption[];
    /** Currently selected tier (Piece / Packet / Carton tab). */
    selectedTier: PackagingTier | null;
    onSelectTier: (tier: PackagingTier) => void;
    /** Count of the selected tier's unit, e.g. "3" packets. */
    tierCount: number;
    onTierCountChange: (count: number) => void;
    /** Extra loose pieces on top of the selected tier (only when tier !== "piece"). */
    extraPieces: number;
    onExtraPiecesChange: (count: number) => void;
    piecePrice: number | null;
}

export default function PackagingSelector({
    options,
    selectedTier,
    onSelectTier,
    tierCount,
    onTierCountChange,
    extraPieces,
    onExtraPiecesChange,
    piecePrice,
}: PackagingSelectorProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const selectedOption = options.find((o) => o.tier === selectedTier);
    const showExtraPieces = selectedTier && selectedTier !== "piece";

    return (
        <Box>
            <Typography
                sx={{ fontWeight: 700, fontSize: 18, mb: 1.25, color: isDark ? "#fff" : "inherit" }}
            >
                Packaging
            </Typography>

            {/* Tier tabs: Piece / Packet / Carton */}
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                {options.map((option) => {
                    const active = option.tier === selectedTier;
                    return (
                        <Box
                            key={option.tier}
                            component="button"
                            type="button"
                            onClick={() => onSelectTier(option.tier)}
                            sx={{
                                flex: 1,
                                py: 1,
                                borderRadius: 2,
                                border: active
                                    ? `1px solid ${SELLER_BRAND_DARK}`
                                    : "1px solid",
                                borderColor: active
                                    ? SELLER_BRAND_DARK
                                    : isDark
                                      ? "rgba(255,255,255,0.12)"
                                      : "rgba(0,0,0,0.12)",
                                bgcolor: active
                                    ? SELLER_BRAND_DARK
                                    : isDark
                                      ? "#1e1e1e"
                                      : "#f5f5f5",
                                color: active ? "#fff" : isDark ? "#aaa" : "text.secondary",
                                fontWeight: 700,
                                fontSize: 14,
                                cursor: "pointer",
                                transition: "all 0.15s",
                            }}
                        >
                            {PACKAGING_TIER_LABEL[option.tier]}
                        </Box>
                    );
                })}
            </Stack>

            {/* Selected tier stepper card */}
            {selectedOption && (
                <Box
                    sx={{
                        bgcolor: isDark ? "#1e1e1e" : "#f5f2ed",
                        border: `1px solid ${SELLER_BRAND_DARK}4d`,
                        borderRadius: 4,
                        p: 1.5,
                    }}
                >
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: showExtraPieces ? 1.5 : 0 }}
                    >
                        <Box>
                            <Typography
                                sx={{
                                    fontWeight: 700,
                                    color: isDark ? "#fff" : "inherit",
                                }}
                            >
                                {PACKAGING_TIER_LABEL[selectedOption.tier]}
                            </Typography>
                            {selectedOption.unitsPerTier != null && (
                                <Typography
                                    variant="caption"
                                    sx={{ color: "text.secondary", display: "block" }}
                                >
                                    {selectedOption.unitsPerTier} Pieces
                                </Typography>
                            )}
                            {selectedOption.unitPrice != null && (
                                <Typography
                                    variant="caption"
                                    sx={{ color: SELLER_BRAND_DARK, fontWeight: 700 }}
                                >
                                    {selectedOption.unitPrice} Birr /{" "}
                                    {PACKAGING_TIER_LABEL[selectedOption.tier].toLowerCase()}
                                </Typography>
                            )}
                        </Box>

                        <Stepper
                            value={tierCount}
                            onChange={onTierCountChange}
                            min={0}
                            size="lg"
                        />
                    </Stack>

                    {/* Nested "extra pieces" stepper */}
                    {showExtraPieces && (
                        <Box
                            sx={{
                                ml: 2.5,
                                pl: 1.5,
                                borderLeft: "2px solid",
                                borderColor: isDark
                                    ? "rgba(255,255,255,0.1)"
                                    : "rgba(0,0,0,0.08)",
                            }}
                        >
                            <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                            >
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: 600,
                                            color: isDark ? "#ccc" : "text.secondary",
                                        }}
                                    >
                                        + Pieces
                                    </Typography>
                                    {piecePrice != null && (
                                        <Typography
                                            variant="caption"
                                            sx={{ color: SELLER_BRAND_DARK, fontWeight: 700 }}
                                        >
                                            {piecePrice} Birr ea.
                                        </Typography>
                                    )}
                                </Box>
                                <Stepper
                                    value={extraPieces}
                                    onChange={onExtraPiecesChange}
                                    min={0}
                                    size="sm"
                                />
                            </Stack>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}

function Stepper({
    value,
    onChange,
    min = 0,
    max,
    size = "lg",
}: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    size?: "lg" | "sm";
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";
    const dims = size === "lg" ? 36 : 28;

    const clamp = (n: number) => {
        let next = n;
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        return next;
    };

    return (
        <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            sx={{
                bgcolor: isDark ? "#2a2a2a" : "#fff",
                border: isDark ? "none" : "1px solid rgba(0,0,0,0.08)",
                borderRadius: 99,
                p: 0.5,
            }}
        >
            <IconButton
                size="small"
                onClick={() => onChange(clamp(value - 1))}
                sx={{
                    width: dims,
                    height: dims,
                    color: isDark ? "#fff" : "inherit",
                }}
            >
                <RemoveRoundedIcon fontSize="small" />
            </IconButton>
            <Typography
                sx={{
                    minWidth: size === "lg" ? 28 : 22,
                    textAlign: "center",
                    fontWeight: 700,
                    color: isDark ? "#fff" : "inherit",
                }}
            >
                {value}
            </Typography>
            <IconButton
                size="small"
                onClick={() => onChange(clamp(value + 1))}
                sx={{
                    width: dims,
                    height: dims,
                    bgcolor: size === "lg" ? SELLER_BRAND_DARK : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                    color: size === "lg" ? "#fff" : isDark ? "#fff" : "inherit",
                    "&:hover": {
                        bgcolor: size === "lg" ? SELLER_BRAND_DARK : isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)",
                    },
                }}
            >
                <AddRoundedIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
}
