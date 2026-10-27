import React from 'react';
import { Box, Chip, Collapse, Stack, Typography } from '@mui/material';
import { PanelSection, StockBreakdownPanel, ReplenishmentPanel, StitchVariantCard, InventoryItem, Variant } from './StoreInventory';

/**
 * An item's detail under its card: three stacked sections, top to bottom, the
 * way the seller's pages group a topic: where the stock is and how it is
 * packed, the refill levels, then each SKU variant with its prices.
 */
export default function StitchProductDetails({
    expanded,
    item,
    variants,
    hasLow,
    lowStockVariants,
    highlightedVariantId,
    setEditing
}: {
    expanded: boolean;
    item: InventoryItem;
    variants: Variant[];
    hasLow: boolean;
    lowStockVariants: number;
    highlightedVariantId: number | null;
    setEditing: (v: Variant) => void;
}) {
    return (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, minWidth: 0 }}>
                <Stack spacing={1.5}>
                    <StockBreakdownPanel item={item} variants={variants} />

                    <PanelSection
                        icon="rule"
                        title="Refill levels"
                        note={hasLow ? <Chip size="small" color="error" label={`${lowStockVariants} low`} sx={{ height: 20, fontWeight: 700 }} /> : undefined}
                    >
                        <ReplenishmentPanel variants={variants} />
                    </PanelSection>

                    <PanelSection icon="style" title={`SKU variants (${variants.length})`} note="B2B and DTC tier pricing">
                        <Stack spacing={1.25}>
                            {variants.length === 0 && <Typography variant="body2" color="text.secondary">No variants.</Typography>}
                            {variants.map(v => (
                                <StitchVariantCard key={v.id} v={v}
                                    highlighted={highlightedVariantId === v.id}
                                    onEdit={() => setEditing(v)} />
                            ))}
                        </Stack>
                    </PanelSection>
                </Stack>
            </Box>
        </Collapse>
    );
}
