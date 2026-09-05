import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface InventoryLocationBreakdown {
    location: string;
    cartons: number;
    packets: number;
    pieces: number;
}

export interface InventoryDetailListProps {
    inStock: boolean;
    stockCount?: number;
    locations?: InventoryLocationBreakdown[];
}

function formatBreakdown(loc: InventoryLocationBreakdown) {
    const parts: string[] = [];
    if (loc.cartons > 0) parts.push(`${loc.cartons} cartoon${loc.cartons === 1 ? "" : "s"}`);
    if (loc.packets > 0) parts.push(`${loc.packets} packet${loc.packets === 1 ? "" : "s"}`);
    parts.push(`${loc.pieces} piece${loc.pieces === 1 ? "" : "s"}`);
    return parts.join(", ");
}

export default function InventoryDetailList({
    inStock,
    stockCount,
    locations = [],
}: InventoryDetailListProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    return (
        <Box
            sx={{
                bgcolor: isDark ? "#1e1e1e" : "#f5f2ed",
                border: "1px solid",
                borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
                borderRadius: 4,
                p: 1.5,
            }}
        >
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1 }}
            >
                <Typography
                    variant="caption"
                    sx={{ color: isDark ? "#999" : "text.secondary", fontWeight: 600 }}
                >
                    Stock Details
                </Typography>
                <Typography
                    variant="caption"
                    sx={{
                        color: inStock ? "#22c55e" : "error.main",
                        fontWeight: 700,
                    }}
                >
                    {inStock ? "In Stock" : "Out of Stock"}
                </Typography>
            </Stack>

            <Stack spacing={1}>
                {locations.length > 0 ? (
                    locations.map((loc) => (
                        <Stack
                            key={loc.location}
                            direction="row"
                            justifyContent="space-between"
                            sx={{ fontSize: 14 }}
                        >
                            <Typography
                                variant="body2"
                                sx={{ color: isDark ? "rgba(255,255,255,0.7)" : "text.secondary" }}
                            >
                                {loc.location}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: 700,
                                    color: isDark ? "#fff" : "text.primary",
                                    textAlign: "right",
                                }}
                            >
                                {formatBreakdown(loc)}
                            </Typography>
                        </Stack>
                    ))
                ) : (
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        sx={{ fontSize: 14 }}
                    >
                        <Typography
                            variant="body2"
                            sx={{ color: isDark ? "rgba(255,255,255,0.7)" : "text.secondary" }}
                        >
                            Store Inventory
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 700,
                                color: isDark ? "#fff" : "text.primary",
                                textAlign: "right",
                            }}
                        >
                            {stockCount ?? 0} pcs available
                        </Typography>
                    </Stack>
                )}
            </Stack>
        </Box>
    );
}
