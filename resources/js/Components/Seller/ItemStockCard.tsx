import { SellerCard, sellerPrice } from "@/Components/Seller/sellerUi";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

export interface ItemStockCardProps {
    /** Counts are in the selected variant's own packaging unit (`unitName`). */
    shelfStock: number;
    floorStock: number;
    /** The store's Remote Hub holds some; getting it here is a transfer. */
    inRemoteHub: boolean;
    unitName: string;
    unitsInPack: number;
    perPiece: number | null;
    perPacket: number | null;
}

const plural = (count: number, unit: string) => (count === 1 || /s$/i.test(unit) ? unit : `${unit}s`);

function StockFigure({ icon, label, count, unitName }: { icon: string; label: string; count: number; unitName: string }) {
    const empty = count <= 0;

    return (
        <Box
            sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                p: 1.25,
                borderRadius: 2.5,
                border: 1,
                borderColor: empty ? alpha(theme.palette.warning.main, 0.3) : "divider",
                bgcolor: empty ? alpha(theme.palette.warning.main, 0.08) : "background.default",
            })}
        >
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: "text.secondary" }}>
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {label}
                </Typography>
            </Stack>
            <Typography sx={{ mt: 0.25, fontWeight: 800, fontSize: "1.15rem", color: empty ? "warning.main" : "text.primary" }}>
                {count.toLocaleString()}
                <Typography component="span" sx={{ ml: 0.5, fontSize: "0.8rem", fontWeight: 600, color: "text.secondary" }}>
                    {plural(count, unitName)}
                </Typography>
            </Typography>
        </Box>
    );
}

/**
 * What the seller can sell from for the selected variant: the Store Shelf and
 * the Store Floor, each with its own count. The Remote Hub is only flagged,
 * never counted, because selling from it means asking for a transfer.
 */
export default function ItemStockCard({ shelfStock, floorStock, inRemoteHub, unitName, unitsInPack, perPiece, perPacket }: ItemStockCardProps) {
    return (
        <SellerCard>
            <Stack spacing={1.5}>
                <Stack direction="row" spacing={1}>
                    <StockFigure icon="shelves" label="Store Shelf" count={shelfStock} unitName={unitName} />
                    <StockFigure icon="warehouse" label="Store Floor" count={floorStock} unitName={unitName} />
                </Stack>

                {inRemoteHub && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={(theme) => ({ px: 1.25, py: 1, borderRadius: 2.5, bgcolor: alpha(theme.palette.info.main, 0.1), color: "info.main" })}
                    >
                        <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Stocked in Remote Hub
                            <Typography component="span" variant="body2" sx={{ ml: 0.5, color: "text.secondary", fontWeight: 400 }}>
                                · needs a transfer
                            </Typography>
                        </Typography>
                    </Stack>
                )}

                <Stack direction="row" justifyContent="space-between" spacing={2} flexWrap="wrap" useFlexGap sx={{ rowGap: 1.5 }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Units in pack
                        </Typography>
                        <Typography sx={{ fontWeight: 700 }}>{unitsInPack}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Per unit
                        </Typography>
                        <Typography sx={{ fontWeight: 700 }}>{sellerPrice(perPiece)}</Typography>
                    </Box>
                    {perPacket != null && (
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Per packet
                            </Typography>
                            <Typography sx={{ fontWeight: 700 }}>{sellerPrice(perPacket)}</Typography>
                        </Box>
                    )}
                </Stack>
            </Stack>
        </SellerCard>
    );
}
