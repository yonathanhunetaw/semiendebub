import { SellerCard, sellerPrice } from "@/Components/Seller/sellerUi";
import { Box, Stack, Typography } from "@mui/material";

export interface ItemStockCardProps {
    stock: number;
    unitsInPack: number;
    perPiece: number | null;
    perPacket: number | null;
}

export default function ItemStockCard({
    stock,
    unitsInPack,
    perPiece,
    perPacket,
}: ItemStockCardProps) {
    return (
        <SellerCard>
            <Stack direction="row" justifyContent="space-between" spacing={2}>
                <Box>
                    <Typography variant="body2" color="text.secondary">
                        Stock
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>{stock}</Typography>
                </Box>
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
                    <Typography sx={{ fontWeight: 700 }}>
                        {sellerPrice(perPiece)}
                    </Typography>
                </Box>
                {perPacket != null && (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Per packet
                        </Typography>
                        <Typography sx={{ fontWeight: 700 }}>
                            {sellerPrice(perPacket)}
                        </Typography>
                    </Box>
                )}
            </Stack>
        </SellerCard>
    );
}
