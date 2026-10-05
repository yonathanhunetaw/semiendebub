import { sellerPrice } from "@/Components/Seller/sellerUi";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import { Box, IconButton, Stack, Typography } from "@mui/material";
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
    extraBoxes?: number;
    onExtraBoxesChange?: (count: number) => void;
    piecePrice: number | null;
    boxPrice?: number | null;
}

export default function PackagingSelector({
    options,
    selectedTier,
    onSelectTier,
    tierCount,
    onTierCountChange,
    extraPieces,
    onExtraPiecesChange,
    extraBoxes = 0,
    onExtraBoxesChange = () => {},
    piecePrice,
    boxPrice = null,
}: PackagingSelectorProps) {

    const selectedOption = options.find((o) => o.tier === selectedTier);
    const showExtraPieces = selectedTier && selectedTier !== "piece";

    return (
        <Box>
            <Typography
                sx={{ fontWeight: 700, fontSize: 18, mb: 1.25, color: "text.primary" }}
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
                                    ? "1px solid rgb(var(--primary))"
                                    : "1px solid",
                                borderColor: active
                                    ? "primary.main"
                                    : "rgb(var(--on-surface) / 0.12)",
                                bgcolor: active
                                    ? "primary.main"
                                    : "rgb(var(--surface-container))",
                                color: active ? "primary.contrastText" : "text.secondary",
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
                        bgcolor: "rgb(var(--surface-container))",
                        border: "1px solid rgb(var(--primary) / 0.3)",
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
                                    color: "text.primary",
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
                                    {selectedOption.tier === "cartoon" && options.find(o => o.tier === "box")?.unitsPerTier ? (
                                        ` (${Math.floor(selectedOption.unitsPerTier / options.find(o => o.tier === "box")!.unitsPerTier!)} Boxes)`
                                    ) : null}
                                </Typography>
                            )}
                            {selectedOption.unitPrice != null && (
                                <Typography
                                    variant="caption"
                                    sx={{ color: "primary.main", fontWeight: 700 }}
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

                    {/* Nested "extra boxes" stepper */}
                    {selectedTier === "cartoon" && options.find(o => o.tier === "box") && (
                        <Box
                            sx={{
                                ml: 2.5,
                                pl: 1.5,
                                pt: 1.5,
                                borderLeft: "2px solid",
                                borderColor: "rgb(var(--on-surface) / 0.08)",
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
                                            color: "text.secondary",
                                        }}
                                    >
                                        + Boxes
                                    </Typography>
                                    {boxPrice != null && (
                                        <Typography
                                            variant="caption"
                                            sx={{ color: "primary.main", fontWeight: 700 }}
                                        >
                                            {sellerPrice(boxPrice)} Birr ea.
                                        </Typography>
                                    )}
                                </Box>
                                <Stepper
                                    value={extraBoxes}
                                    onChange={onExtraBoxesChange}
                                    min={0}
                                    size="sm"
                                />
                            </Stack>
                        </Box>
                    )}

                    {/* Nested "extra pieces" stepper */}
                    {showExtraPieces && (
                        <Box
                            sx={{
                                ml: 2.5,
                                pl: 1.5,
                                pt: 1.5,
                                borderLeft: "2px solid",
                                borderColor: "rgb(var(--on-surface) / 0.08)",
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
                                            color: "text.secondary",
                                        }}
                                    >
                                        + Pieces
                                    </Typography>
                                    {piecePrice != null && (
                                        <Typography
                                            variant="caption"
                                            sx={{ color: "primary.main", fontWeight: 700 }}
                                        >
                                            {sellerPrice(piecePrice)} Birr ea.
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
                bgcolor: "rgb(var(--surface-bright))",
                border: "1px solid rgb(var(--on-surface) / 0.08)",
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
                    color: "text.primary",
                }}
            >
                <RemoveRoundedIcon fontSize="small" />
            </IconButton>
            <Typography
                sx={{
                    minWidth: size === "lg" ? 28 : 22,
                    textAlign: "center",
                    fontWeight: 700,
                    color: "text.primary",
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
                    bgcolor: size === "lg" ? "primary.main" : "rgb(var(--on-surface) / 0.08)",
                    color: size === "lg" ? "primary.contrastText" : "text.primary",
                    "&:hover": {
                        bgcolor: size === "lg" ? "primary.main" : "rgb(var(--on-surface) / 0.14)",
                    },
                }}
            >
                <AddRoundedIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
}
