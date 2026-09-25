const fs = require('fs');

const controllerFile = '/Users/baby/Desktop/Duka/app/Http/Controllers/Admin/Store/StoreController.php';
let controllerContent = fs.readFileSync(controllerFile, 'utf8');

// Find the mapItem method if I want to extract it, or just copy the mapping block for one item.
// Let's replace the whole itemVariants method to use the same mapping.
const itemVariantsNewMethod = `
    public function itemVariants(Store $store, \\App\\Models\\Item\\Item $item)
    {
        $item->load([
            'category',
            'variants' => function ($q) use ($store) {
                $q->whereHas('storeVariants', function ($q2) use ($store) {
                    $q2->where('store_id', $store->id);
                })
                    ->with([
                        'itemColor',
                        'itemSize',
                        'itemPackagingType',
                        'packagingQuantities',
                        'storeVariants' => function ($q2) use ($store) {
                            $q2->where('store_id', $store->id)
                                ->with([
                                    'stocks',
                                    'customerPrices.customer',
                                    'sellerPrices.seller',
                                    'individualPrice',
                                ]);
                        },
                    ]);
            }
        ]);

        $storeVariants = collect();
        foreach ($item->variants as $itemVariant) {
            foreach ($itemVariant->storeVariants as $sv) {
                $sv->setRelation('itemVariant', $itemVariant);
                $itemVariant->setRelation('item', $item);
                $storeVariants->push($sv);
            }
        }

        $storeVariantIds = $storeVariants->pluck('id')->toArray();
        $batchStocks = app(\\App\\Services\\StockService::class)->getBatchStock($storeVariantIds);

        $mappedVariants = $storeVariants->map(function ($sv) use ($store, $batchStocks) {
            $priceLadder = \\App\\Services\\PriceProvider::getPriceLadder($sv->id, $store->id, null, null);
            $finalPrice = \\App\\Services\\PriceProvider::getFinalPrice($priceLadder);

            $basePrice = $priceLadder[0]['price'] ?? 0;
            $discountPrice = $priceLadder[0]['discount_price'] ?? null;
            $discountEndsAt = $priceLadder[0]['discount_ends_at'] ?? null;

            $store_stock = $batchStocks[$sv->id] ?? 0;
            $remote_stock = 0;
            if ($store->warehouse) {
                $remote_stock = \\App\\Models\\Inventory\\ItemStock::where('location_type', \\App\\Models\\Inventory\\Warehouse::class)
                    ->where('location_id', $store->warehouse->id)
                    ->where('item_variant_id', $sv->itemVariant->id)
                    ->sum('quantity');
            }

            $pieces = $sv->itemVariant->calculateTotalPieces();
            $multiplier = $pieces > 0 ? $pieces : 1;

            return [
                'id' => $sv->id,
                'sku' => $sv->itemVariant->sku ?? '—',
                'label' => implode(' / ', array_filter([
                    $sv->itemVariant->itemColor?->name,
                    $sv->itemVariant->itemSize?->name,
                    $sv->itemVariant->itemPackagingType?->name ?? $sv->itemVariant->packagingQuantities->first()?->name,
                ])) ?: $sv->itemVariant->sku,

                'price' => $basePrice,
                'discount_price' => $discountPrice,
                'discount_ends_at' => $discountEndsAt,
                'final_price' => $finalPrice,
                'active' => (bool) $sv->active,
                'stock' => $store_stock,
                'remote_stock' => $remote_stock,
                'multiplier' => $multiplier,

                'individual_price' => $sv->individualPrice ? [
                    'price' => $sv->individualPrice->price,
                    'discount_price' => $sv->individualPrice->discount_price,
                    'discount_ends_at' => $sv->individualPrice->discount_ends_at,
                ] : null,

                'customer_prices' => $sv->customerPrices->map(fn($cp) => [
                    'id' => $cp->id,
                    'customer_id' => $cp->customer_id,
                    'customer_name' => $cp->customer ? trim($cp->customer->first_name . ' ' . $cp->customer->last_name) : 'Unknown',
                    'customer_type' => $cp->customer_type,
                    'price' => $cp->price,
                    'discount_price' => $cp->discount_price,
                    'discount_ends_at' => $cp->discount_ends_at,
                ]),

                'seller_prices' => $sv->sellerPrices->map(fn($sp) => [
                    'id' => $sp->id,
                    'seller_id' => $sp->seller_id,
                    'seller_name' => $sp->seller ? trim($sp->seller->first_name . ' ' . $sp->seller->last_name) : 'Unknown',
                    'customer_type' => $sp->customer_type,
                    'price' => $sp->price,
                    'discount_price' => $sp->discount_price,
                    'discount_ends_at' => $sp->discount_ends_at,
                ]),
                'min_reorder' => $sv->min_reorder_level,
                'max_stock' => $sv->max_stock_level,
            ];
        });

        $totalStock = $mappedVariants->sum('stock');
        $remoteTotalStock = $mappedVariants->sum('remote_stock');

        $mappedItem = [
            'item_id' => $item->id,
            'item_name' => $item->name,
            'category' => $item->category?->name ?? 'Uncategorized',
            'starting_price' => $mappedVariants->min('price') ?? 0,
            'total_variants' => $mappedVariants->count(),
            'total_stock' => $totalStock,
            'remote_total_stock' => $remoteTotalStock,
            'variants' => $mappedVariants->values()->all(),
        ];

        // Also fetch customers and sellers for the UI
        $customers = \\App\\Models\\User\\Customer::select('id', 'first_name', 'last_name')->get();
        $sellers = \\App\\Models\\User\\User::role('seller')->select('id', 'first_name', 'last_name')->get();

        return Inertia\\Inertia::render('Admin/Inventory/Stores/ItemVariants', [
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
            ],
            'item' => $mappedItem,
            'customers' => $customers,
            'sellers' => $sellers,
        ]);
    }
`;

controllerContent = controllerContent.replace(
    /public function itemVariants\(Store \$store, \\App\\Models\\Item\\Item \$item\)[\s\S]*?return Inertia::render\('Admin\/Inventory\/Stores\/ItemVariants'[\s\S]*?\]\);\n    \}/,
    itemVariantsNewMethod.trim()
);
fs.writeFileSync(controllerFile, controllerContent);

// Now update ItemVariants.tsx to render the StitchProductDetails component!
const pageFile = '/Users/baby/Desktop/Duka/resources/js/Pages/Admin/Inventory/Stores/ItemVariants.tsx';
const pageContent = `import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Box, Typography, Card, CardContent, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AdminLayout from '@/Layouts/AdminLayout';
import StitchProductDetails from './StitchProductDetails';
import { InventoryItem, Variant, Person } from './StoreInventory';

export default function ItemVariants({ store, item, customers, sellers }: { 
    store: { id: number, name: string }, 
    item: InventoryItem, 
    customers: Person[], 
    sellers: Person[] 
}) {
    // Component expects expanded to be true since it's the main page now.
    const [expanded, setExpanded] = useState(true);
    const [tab, setTab] = useState<"stock" | "replenish" | "variants">("stock");
    const [highlightedVariantId, setHighlightedVariantId] = useState<number | null>(null);
    const [editing, setEditing] = useState<Variant | null>(null);
    
    // Low stock calculation exactly as in StoreInventory.tsx
    const lowStockVariants = item.variants.filter(v =>
        v.active && v.stock < (v.min_reorder ?? v.multiplier * 5)
    ).length;
    const hasLow = lowStockVariants > 0;

    return (
        <AdminLayout>
            <Head title={\`Variants - \${item.item_name}\`} />
            <Box sx={{ p: { xs: 1, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                    <IconButton onClick={() => router.visit(route('admin.inventory.stores.show', store.id))} sx={{ mr: 2 }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>
                            {item.item_name}
                        </Typography>
                        <Typography variant="subtitle1" color="text.secondary">
                            Store: {store.name}
                        </Typography>
                    </Box>
                </Box>
                
                <Card sx={{ borderRadius: 3 }}>
                    <CardContent sx={{ p: 0 }}>
                        <StitchProductDetails
                            expanded={expanded}
                            setExpanded={setExpanded}
                            tab={tab}
                            setTab={setTab}
                            item={item}
                            variants={item.variants}
                            hasLow={hasLow}
                            lowStockVariants={lowStockVariants}
                            highlightedVariantId={highlightedVariantId}
                            setEditing={setEditing}
                        />
                    </CardContent>
                </Card>
            </Box>
        </AdminLayout>
    );
}
`;
fs.writeFileSync(pageFile, pageContent);

// One tiny fix: StoreInventory.tsx route name fallback
// In the newly mapped page we are calling route('admin.inventory.stores.show', store.id) which might actually be route('store.show', store.id) based on the routes file
// Let's replace 'admin.inventory.stores.show' with 'admin.store.show'
let p = fs.readFileSync(pageFile, 'utf8');
p = p.replace("route('admin.inventory.stores.show'", "route('admin.store.show'");
fs.writeFileSync(pageFile, p);
console.log("Updated both files successfully.");
