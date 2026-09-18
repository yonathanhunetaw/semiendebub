import React, { useState, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import {
    Box, Typography, Card, CardContent,
    IconButton, Stack, Chip, Button,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AdminLayout from '@/Layouts/AdminLayout';
import StitchProductDetails from './StitchProductDetails';
import { InventoryItem, Variant, Person, EditDrawer, decomposeStock } from './StoreInventory';

export default function ItemVariants({ store, item, customers, sellers }: {
    store: { id: number; name: string };
    item: InventoryItem;
    customers: Person[];
    sellers: Person[];
}) {
    const [expanded, setExpanded] = useState(true);
    const [tab, setTab] = useState<'stock' | 'replenish' | 'variants'>('stock');
    const [variants, setVariants] = useState<Variant[]>(item.variants);
    const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);
    const [editing, setEditing] = useState<Variant | null>(null);

    const stockAggregate = useMemo(() => {
        let cartons = 0, boxes = 0, pieces = 0, perBoxTotal = 0;
        variants.forEach(v => {
            const d = decomposeStock(v.stock, v.multiplier);
            cartons += d.cartons;
            boxes += d.boxes;
            pieces += d.pieces;
            perBoxTotal += d.perBox;
        });
        const avgPerBox = variants.length ? Math.round(perBoxTotal / variants.length) : 12;
        return { cartons, boxes, pieces, perBox: avgPerBox, perCarton: avgPerBox * 10 };
    }, [variants]);

    const lowStockVariants = variants.filter(v =>
        v.active && v.stock < (v.min_reorder ?? v.multiplier * 5)
    ).length;
    const hasLow = lowStockVariants > 0;

    const handleSaved = (updated: Variant) => {
        setVariants(prev => prev.map(v => (v.id === updated.id ? updated : v)));
        setEditing(null);
        setExpanded(true);
        setHighlightedVariantId(updated.id);
        window.setTimeout(() => {
            document.getElementById(`variant-${updated.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
        window.setTimeout(() => { setHighlightedVariantId(null); router.reload(); }, 1900);
    };

    return (
        <AdminLayout>
            <Head title={`${item.item_name} — Variants`} />
            <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1200, mx: 'auto' }}>

                {/* ── Back button (standalone, above card) ─────────────── */}
                <Box sx={{ mb: 1.5 }}>
                    <Button
                        startIcon={<ArrowBackIcon />}
                        onClick={() => router.visit(route('store.show', store.id))}
                        sx={{ textTransform: 'none', color: 'text.secondary', fontWeight: 600 }}
                    >
                        Back to {store.name}
                    </Button>
                </Box>

                {/* ── Product header card — same as StitchProductCard ───── */}
                <Card sx={{ mb: 2, borderRadius: 3, overflow: 'visible' }}>
                    <CardContent sx={{ pb: 1 }}>
                        <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <Box sx={{
                                position: 'relative', width: 72, height: 72, borderRadius: 2,
                                flex: '0 0 auto', bgcolor: 'grey.100',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Inventory2Icon sx={{ color: 'grey.400', fontSize: 32 }} />
                                <Chip label={item.category} size="small"
                                    sx={{ position: 'absolute', bottom: 4, right: 4, height: 18, fontSize: '0.6rem',
                                        bgcolor: 'rgba(15,23,42,0.85)', color: '#fff' }} />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                                    <Chip label={`SKU-${item.item_id}`} size="small"
                                        sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace',
                                            bgcolor: 'grey.100', color: 'text.secondary' }} />
                                    <Chip size="small" variant="outlined"
                                        label={hasLow ? `${lowStockVariants} low` : 'In-Stock'}
                                        color={hasLow ? 'error' : 'success'}
                                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                                </Stack>
                                <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                                    {item.item_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    {item.category} • {item.total_variants} variants
                                </Typography>
                                <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                                    <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1 }}>
                                        {item.total_stock}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Pcs Total
                                    </Typography>
                                    <Chip size="small"
                                        label={`${stockAggregate.cartons} Ctns • ${stockAggregate.boxes} Bx • ${stockAggregate.pieces} Pcs`}
                                        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: 'grey.100' }} />
                                </Stack>
                            </Box>
                        </Stack>
                    </CardContent>
                </Card>

                {/* ── Details panel (tabs) ──────────────────────────────── */}
                <Card sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: 0 }}>
                        <StitchProductDetails
                            expanded={expanded}
                            setExpanded={setExpanded}
                            tab={tab}
                            setTab={setTab}
                            item={item}
                            variants={variants}
                            hasLow={hasLow}
                            lowStockVariants={lowStockVariants}
                            highlightedVariantId={highlightedVariantId}
                            setEditing={setEditing}
                        />
                    </CardContent>
                </Card>

                {/* ── Edit drawer ───────────────────────────────────────── */}
                {editing && (
                    <EditDrawer
                        variant={editing}
                        customers={customers}
                        sellers={sellers}
                        onClose={() => setEditing(null)}
                        onSaved={handleSaved}
                    />
                )}
            </Box>
        </AdminLayout>
    );
}
