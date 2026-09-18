import React from 'react';
import { Box, Button, Stack, Typography, Collapse, Divider, Tabs, Tab, Chip } from '@mui/material';
import RuleSettingsIcon from '@mui/icons-material/Rule';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import StyleIcon from '@mui/icons-material/Style';
import { StockBreakdownPanel, ReplenishmentPanel, StitchVariantCard, InventoryItem, Variant } from './StoreInventory';

export default function StitchProductDetails({
    expanded,
    setExpanded,
    tab,
    setTab,
    item,
    variants,
    hasLow,
    lowStockVariants,
    highlightedVariantId,
    setEditing
}: {
    expanded: boolean;
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    tab: "stock" | "replenish" | "variants";
    setTab: (val: "stock" | "replenish" | "variants") => void;
    item: InventoryItem;
    variants: Variant[];
    hasLow: boolean;
    lowStockVariants: number;
    highlightedVariantId: number | null;
    setEditing: (v: Variant) => void;
}) {
    return (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Divider />
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable"
                        scrollButtons="auto" sx={{ minHeight: 36, mb: 2,
                            "& .MuiTab-root": { minHeight: 36, py: 0.5, fontSize: "0.72rem", textTransform: "none" } }}>
                        <Tab value="stock" icon={<Inventory2Icon sx={{ fontSize: 16 }} />}
                            iconPosition="start" label="Active Stock & Packaging" />
                        <Tab value="replenish" icon={<RuleSettingsIcon sx={{ fontSize: 16 }} />}
                            iconPosition="start"
                            label={
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <span>Replenishment Rules</span>
                                    {hasLow && (
                                        <Chip size="small" color="error" label={`${lowStockVariants} Low`}
                                            sx={{ height: 16, fontSize: "0.6rem", fontWeight: 700 }} />
                                    )}
                                </Stack>
                            } />
                        <Tab value="variants" icon={<StyleIcon sx={{ fontSize: 16 }} />}
                            iconPosition="start" label={`SKU Variants (${item.total_variants})`} />
                    </Tabs>

                    {tab === "stock" && <StockBreakdownPanel item={item} variants={variants} />}
                    {tab === "replenish" && <ReplenishmentPanel variants={variants} />}
                    {tab === "variants" && (
                        <Stack spacing={1.25}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" px={0.5}>
                                <Stack direction="row" spacing={0.75} alignItems="center">
                                    <StyleIcon fontSize="small" sx={{ color: "primary.main" }} />
                                    <Typography variant="subtitle2" fontWeight={700}>
                                        Individual SKU Variants ({variants.length})
                                    </Typography>
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    B2B &amp; DTC Tier Pricing
                                </Typography>
                            </Stack>
                            {variants.map(v => (
                                <StitchVariantCard key={v.id} v={v}
                                    highlighted={highlightedVariantId === v.id}
                                    onEdit={() => setEditing(v)} />
                            ))}
                        </Stack>
                    )}
                </Box>
            </Collapse>
    );
}
