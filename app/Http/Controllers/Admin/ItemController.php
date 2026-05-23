<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\ImageResolver;
use App\Services\ItemVariantGenerationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Inertia\Inertia;

// This single line generates the following routes:
//
// GET /item                → index method
// GET /item/create         → create method
// POST /item               → store method
// GET /item/{item}         → show method
// GET /item/{item}/edit    → edit method
// PUT/PATCH /item/{item}   → update method
// DELETE /item/{item}      → destroy method

class ItemController extends Controller
{
    public function __construct(
        private readonly ItemVariantGenerationService $itemVariantGenerationService
    ) {
    }

    // ──────────────────────────────────────────────────────────────────────────
    // INDEX
    // ──────────────────────────────────────────────────────────────────────────



    public function index()
    {
        //####################################################################################################
        // 🪵 LOG 1: Track start of the admin request
        Log::info("Admin Items Index: Fetching raw dataset");

        $startTime = microtime(true);

        $items = Item::with(['variants.storeVariants'])->get();
        $stores = Store::all();

        // 🪵 LOG 2: Benchmark initial database pull
        Log::info("Admin Items Index: DB queries complete", [
            'items_raw_count' => $items->count(),
            'stores_count' => $stores->count(),
            'db_time_ms' => round((microtime(true) - $startTime) * 1000, 2)
        ]);
        //####################################################################################################

        $mappingStartTime = microtime(true);

        $processedItems = $items->map(function ($item) {
            // Fallback to empty array if general_images is null
            $generalImages = $item->general_images ?? [];

            // Safety check if the JSON/cast failed and returned a string instead of an array
            if (is_string($generalImages)) {
                Log::warning("Item ID {$item->id} has 'general_images' stored as a string instead of array.", [
                    'raw_value' => $generalImages
                ]);
                $generalImages = json_decode($generalImages, true) ?? [];
            }

            $previewImages = collect($generalImages)
                ->map(fn($path) => ImageResolver::resolve($path))
                ->merge($item->variants->map(fn($v) => ImageResolver::resolve($v->images[0] ?? null)))
                ->filter()
                ->unique()
                ->take(5)
                ->values()
                ->toArray();

            $variantsCount = $item->variants->count();

            $activeVariantsCount = $item->variants->filter(function ($v) {
                return $v->status === 'active' &&
                    $v->storeVariants->where('active', true)->isNotEmpty();
            })->count();

            return [
                'id' => $item->id,
                'product_name' => $item->product_name,
                'status' => $item->status,
                'variants_count' => $variantsCount,
                'active_variants_count' => $activeVariantsCount,
                'processed_images' => $previewImages,
            ];
        });

        $totalTimeMs = round((microtime(true) - $startTime) * 1000, 2);
        $mappingTimeMs = round((microtime(true) - $mappingStartTime) * 1000, 2);

        //####################################################################################################
        // 🪵 LOG 3: Performance breakdown + payload review
        Log::info(
            "Admin Items Index: Data mapping complete\n" .
            json_encode([
                'processed_count' => $processedItems->count(),
                'mapping_time_ms' => $mappingTimeMs,
                'total_time_ms' => $totalTimeMs,
                'items' => $processedItems->map(fn($item) => [
                    'id' => $item['id'],
                    'name' => $item['product_name'],
                    'status' => $item['status'],
                    'total_variants' => $item['variants_count'],
                    'active_v' => $item['active_variants_count']
                ])->values()->all()
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );
        //####################################################################################################

        // 🚨 ADD THIS DIE AND DUMP LINE HERE:
        // dd($processedItems->toArray());

        return Inertia::render('Admin/Items/Index', [
            'items' => $processedItems,
            'stores' => $stores,
            'filters' => request()->only(['filter', 'sort', 'direction']),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SHOW
    // ──────────────────────────────────────────────────────────────────────────

    public function show(Item $item)
    {
        $item->load([
            'category',
            'variants.itemColor',
            'variants.itemSize',
            'variants.packagingQuantities',
            'variants.stocks',

        ]);

        $itemData = [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'product_description' => $item->product_description,
            'status' => $item->status,
            // CHANGED: was $item->processed_images->toArray() (Collection).
            // getProcessedImagesAttribute() now returns array via ImageResolver, so no ->toArray() needed.
            'general_images' => $item->processed_images,
        ];

        // 🔄 Map variants to the dynamic 5-slot front-end interface format
        $variantData = $item->variants->map(function ($variant) {
            // Debugging Log (check your Laravel storage/logs/laravel.log)
            Log::info('Variant Packaging:', [
                'sku' => $variant->sku,
                'packaging' => $variant->packagingQuantities->map(function ($p) {
                    return [
                        'type' => $p->name,
                        'quantity' => $p->pivot->quantity,
                        'cbm' => $p->pivot->cbm
                    ];
                })->toArray()
            ]);

            return [
                'id' => $variant->id,
                'sku' => $variant->sku,
                'color' => $variant->color?->name,
                'size' => $variant->size?->name,
                // Map the collection to include quantity and cbm
                'packaging_details' => $variant->packagingQuantities->map(function ($pack) {
                    return [
                        'type_name' => $pack->name,
                        'quantity' => $pack->pivot->quantity,
                        'cbm' => $pack->pivot->cbm,
                    ];
                }),
                'status' => $variant->status,
                'slots' => $variant->image_slots,
                'slot_count' => count($variant->image_slots),
                'proof_ok' => count($variant->image_slots) >= 2,
            ];
        });

        return Inertia::render('Admin/Items/Show', [
            'item' => $itemData,
            'variantData' => $variantData,
            'stores' => Store::all(),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CREATE
    // ──────────────────────────────────────────────────────────────────────────

    public function create()
    {
        return Inertia::render('Admin/Items/Create', [
            'categories' => ItemCategory::all(),
            'colors' => ItemColor::all(),
            'sizes' => ItemSize::all(),
            'packagingTypes' => ItemPackagingType::all(),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STORE  (single multi-dimensional transaction)
    // ──────────────────────────────────────────────────────────────────────────

    public function store(Request $request)
    {
        $validated = $this->validateItemPayload($request);

        return DB::transaction(function () use ($request, $validated) {

            $item = Item::create([
                'product_name' => $validated['product_name'],
                'product_description' => $validated['product_description'] ?? null,
                'packaging_details' => $validated['packaging_details'] ?? null,
                'item_category_id' => $this->resolveCategoryId($validated['item_category_id']),
                'status' => 'draft', // always draft until proof provided
                'general_images' => $this->handleUploads($request, []),
                'is_incomplete' => true,
            ]);

            $item->colors()->sync($this->resolveOptionIds($validated['color_ids'] ?? [], ItemColor::class));
            $item->sizes()->sync($this->resolveOptionIds($validated['size_ids'] ?? [], ItemSize::class));
            $item->packagingTypes()->sync($this->resolvePackagingPayload($validated['packaging'] ?? []));

            $this->itemVariantGenerationService->sync($item);

            $this->persistVariantImages($request, $item);

            $this->evaluateDraftStatus($item, $validated['status']);

            return redirect()->route('admin.items.edit', $item)
                ->with('success', 'Item created. Upload images for every variant to publish.');
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // EDIT
    // ──────────────────────────────────────────────────────────────────────────

    public function edit(Item $item)
    {
        // 1. Eager load everything smoothly (now including itemPackagingType)
        $item->load([
            'category',
            'colors',
            'sizes',
            'packagingTypes' => fn($q) => $q->withPivot('quantity'),
            // ADDED: packagingQuantities here
            'variants' => fn($q) => $q
                ->with(['itemColor', 'itemSize', 'itemPackagingType', 'packagingQuantities'])
                ->orderBy('id'),
        ]);




        $itemData = [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'product_description' => $item->product_description,
            'packaging_details' => $item->packaging_details,
            'item_category_id' => $item->item_category_id,
            'status' => $item->status,

            // Optimized via ImageResolver (Zero S3 API network checking overhead)
            'general_images' => $item->processed_images,
            'raw_general_images' => $item->general_images ?? [],

            // Flat primitive array mapping for basic option selectors
            'colors' => $item->colors->pluck('id')->toArray(),
            'sizes' => $item->sizes->pluck('id')->toArray(),

            // Multi-dimensional array configuration matching pivot fields
            'packaging' => $item->packagingTypes->map(fn($p) => [
                'item_packaging_type_id' => $p->id,
                'quantity' => $p->pivot->quantity,
            ])->toArray(),

            'variants' => $item->variants->map(function ($variant) {
                return [
                    'id' => $variant->id,
                    'sku' => $variant->sku,
                    // ... your existing keys ...
                    'packaging_quantities' => $variant->packagingQuantities->map(fn($pq) => [
                        'id' => $pq->id,
                        'quantity' => $pq->pivot->quantity,
                        'cbm' => $pq->pivot->cbm,
                    ]),
                    'item_color' => $variant->itemColor,
                    'item_size' => $variant->itemSize,
                    'item_packaging_type' => $variant->itemPackagingType,
                ];
            })->toArray(),
        ];

        return Inertia::render('Admin/Items/Edit', [
            'item' => $itemData,
            'categories' => ItemCategory::all(),
            'colors' => ItemColor::all(),
            'sizes' => ItemSize::all(),
            'packagingTypes' => ItemPackagingType::all(),
        ]);
    }
    // ──────────────────────────────────────────────────────────────────────────
    // UPDATE  (single multi-dimensional transaction)
    // ──────────────────────────────────────────────────────────────────────────

    public function update(Request $request, Item $item)
    {
        $validated = $this->validateItemPayload($request);

        return DB::transaction(function () use ($request, $item, $validated) {

            $item->update([
                'product_name' => $validated['product_name'],
                'product_description' => $validated['product_description'] ?? null,
                'packaging_details' => $validated['packaging_details'] ?? null,
                'item_category_id' => $this->resolveCategoryId($validated['item_category_id']),
                'general_images' => $this->handleUploads($request, $validated['existing_images'] ?? []),
            ]);

            $item->colors()->sync($this->resolveOptionIds($validated['color_ids'] ?? [], ItemColor::class));
            $item->sizes()->sync($this->resolveOptionIds($validated['size_ids'] ?? [], ItemSize::class));
            $item->packagingTypes()->sync($this->resolvePackagingPayload($validated['packaging'] ?? []));

            $this->itemVariantGenerationService->sync($item);

            $this->persistVariantImages($request, $item);

            $this->evaluateDraftStatus($item, $validated['status']);

            return redirect()->route('admin.items.edit', $item)
                ->with('success', 'Item updated successfully.');
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DESTROY
    // ──────────────────────────────────────────────────────────────────────────

    public function destroy(Item $item)
    {
        $item->delete();
        return redirect()->route('admin.items.index')->with('success', 'Item deleted.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // INLINE OPTION
    // ──────────────────────────────────────────────────────────────────────────

    public function storeInlineOption(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:category,color,size,packaging',
            'name' => 'required|string|max:255',
        ]);

        [$modelClass, $nameColumn] = match ($validated['type']) {
            'category' => [ItemCategory::class, 'category_name'],
            'color' => [ItemColor::class, 'name'],
            'size' => [ItemSize::class, 'name'],
            'packaging' => [ItemPackagingType::class, 'name'],
        };

        $record = $modelClass::firstOrCreate([$nameColumn => trim($validated['name'])]);

        return response()->json([
            'id' => $record->id,
            'name' => $record->{$nameColumn},
            'category_name' => $record->{$nameColumn},
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STATUS HELPERS
    // ──────────────────────────────────────────────────────────────────────────

    public function updateStatus(Request $request, Item $item)
    {
        $request->validate(['status' => 'required|in:active,inactive,unavailable,draft']);

        $newStatus = $request->status;

        if ($newStatus === 'active') {
            $item->load('variants');

            $allProven = $item->variants->every(function ($variant) {
                $images = $variant->images ?? [];
                return count($images) >= 2;
            });

            if (!$allProven) {
                return back()->withErrors([
                    'status' => 'Cannot activate: every variant must have at least 2 images (proof) before publishing.',
                ]);
            }
        }

        $item->update(['status' => $newStatus]);

        return back()->with('success', 'Item status updated to ' . ucfirst($newStatus) . '.');
    }

    // Variant status is now a store-level concern — removed updateVariantStatus
    // and its store propagation from the item controller.
    // Store controllers manage store_variants.active directly.

    public function destroyVariant(Item $item, ItemVariant $variant)
    {
        abort_unless($variant->item_id === $item->id, 404);

        DB::transaction(function () use ($variant) {
            $variant->storeVariants()->update(['active' => false]);
            $variant->delete();
        });

        return back()->with('success', 'Variant deleted.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Persist variant images from the multi-dimensional form input.
     *
     * Form key format:
     *   variant_images[colorId:sizeId:packagingId][slotIndex]  → new File
     *   variant_existing_images[colorId:sizeId:packagingId][slotIndex] → path string
     *
     * Images are stored as:  uploads/variants/{sku}/{slotIndex+1}.{ext}
     */
    private function persistVariantImages(Request $request, Item $item): void
    {
        $item->load('variants');

        $newFiles = $request->file('variant_images', []);
        $existingPaths = $request->input('variant_existing_images', []);

        foreach ($item->variants as $variant) {

            // --- STEP 1: Direct Single Image Fast-Track ---
            $fileKey = "variant_image_{$variant->id}";
            if ($request->hasFile($fileKey)) {
                $file = $request->file($fileKey);
                $fileName = "{$variant->sku}_main." . $file->getClientOriginalExtension();
                $path = $file->storeAs("uploads/variants/{$variant->sku}", $fileName, 's3');
                $variant->update(['images' => [$path]]);
                continue;
            }

            // --- STEP 2: Multi-Slot Array Setup (Slots 0 to 4) ---
            $slots = array_fill(0, 5, null);
            $variantKey = $variant->id;

            $existingSlotsForKey = $existingPaths[$variantKey] ?? [];
            foreach ($existingSlotsForKey as $slotIndex => $path) {
                if (is_string($path) && $path !== '') {
                    $slots[(int) $slotIndex] = ltrim($path, '/');
                }
            }

            $newFilesForKey = $newFiles[$variantKey] ?? [];
            foreach ($newFilesForKey as $slotIndex => $file) {
                if ($file && $file->isValid()) {
                    $sku = $variant->sku ?? ('variant_' . $variant->id);
                    $ext = $file->getClientOriginalExtension() ?: 'jpg';
                    $slotNumber = (int) $slotIndex + 1;

                    $path = $file->storeAs(
                        'uploads/variants/' . $sku,
                        "{$sku}_{$slotNumber}.{$ext}",
                        's3'
                    );
                    $slots[(int) $slotIndex] = $path;
                }
            }

            // --- STEP 3: Fallback Merge Architecture ---
            $existingImages = is_array($variant->images) ? $variant->images : [];

            $merged = [];
            for ($i = 0; $i < 5; $i++) {
                if ($slots[$i] !== null) {
                    $merged[] = $slots[$i];
                } elseif (isset($existingImages[$i])) {
                    $merged[] = $existingImages[$i];
                }
            }

            $variant->update(['images' => $merged]);
        }
    }

    /**
     * After images are saved, decide if the item can leave draft status safely.
     * Every variant must have at least 2 image files; otherwise lock to draft state.
     */
    private function evaluateDraftStatus(Item $item, string $requestedStatus): void
    {
        $item->refresh()->load('variants');

        $allProven = $item->variants->every(function ($variant) {
            $images = is_array($variant->images) ? $variant->images : [];
            return count($images) >= 2;
        });

        $finalStatus = $allProven ? $requestedStatus : 'draft';

        $item->update([
            'status' => $finalStatus,
            'is_incomplete' => !$allProven,
        ]);
    }

    private function validateItemPayload(Request $request): array
    {
        $validator = Validator::make($request->all(), [
            'product_name' => 'required|string|max:255',
            'product_description' => 'nullable|string',
            'packaging_details' => 'nullable|string',
            'item_category_id' => 'required',
            'status' => 'required|in:draft,active,inactive,archived',
            'color_ids' => 'nullable|array',
            'color_ids.*' => 'nullable',
            'size_ids' => 'nullable|array',
            'size_ids.*' => 'nullable',
            'packaging' => 'nullable|array',
            'packaging.*.item_packaging_type_id' => 'required',
            'packaging.*.quantity' => 'required|integer|min:1',
            'existing_images' => 'nullable|array|max:10',
            'existing_images.*' => 'string',
            'general_images' => 'nullable|array|max:10',
            'general_images.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            'variant_images' => 'nullable|array',
            'variant_images.*' => 'nullable|array',
            'variant_images.*.*' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            'variant_existing_images' => 'nullable|array',
        ]);

        $validator->after(function ($v) use ($request) {
            $existing = count($request->input('existing_images', []));
            $uploads = count($request->file('general_images', []));

            if (($existing + $uploads) > 10) {
                $v->errors()->add('general_images', 'Maximum 10 general images per item total.');
            }
        });

        return $validator->validate();
    }

    private function resolveCategoryId(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        return ItemCategory::firstOrCreate(['category_name' => trim((string) $value)])->id;
    }

    private function resolveOptionIds(array $values, string $modelClass, string $nameColumn = 'name'): array
    {
        return collect($values)
            ->filter(fn($v) => $v !== null && $v !== '')
            ->map(function ($v) use ($modelClass, $nameColumn) {
                if (is_numeric($v)) {
                    return (int) $v;
                }
                return $modelClass::firstOrCreate([$nameColumn => trim((string) $v)])->id;
            })
            ->unique()->values()->all();
    }

    private function resolvePackagingPayload(array $packaging): array
    {
        return collect($packaging)
            ->filter(fn($row) => filled($row['item_packaging_type_id'] ?? null))
            ->mapWithKeys(function ($row) {
                $typeId = $row['item_packaging_type_id'];
                if (!is_numeric($typeId)) {
                    $typeId = ItemPackagingType::firstOrCreate(['name' => trim((string) $typeId)])->id;
                }
                return [(int) $typeId => ['quantity' => max(1, (int) ($row['quantity'] ?? 1))]];
            })
            ->all();
    }

    private function handleUploads(Request $request, array $existingImages = []): array
    {
        $newPaths = [];

        if ($request->hasFile('general_images')) {
            foreach ($request->file('general_images') as $file) {
                $name = Str::slug($request->product_name) . '_' . time() . '_' . Str::random(5) . '.' . $file->getClientOriginalExtension();
                // Store raw key to MinIO — ImageResolver::resolve() will build the URL at render time
                $path = $file->storeAs('uploads/items', $name, 's3');
                $newPaths[] = $path;
            }
        }

        return array_merge($existingImages, $newPaths);
    }

    /**
     * Modernized upload endpoint for MinIO
     */
    public function uploadImages(Request $request)
    {
        $request->validate([
            'product_name' => 'required|string',
            'product_images' => 'required|array',
            'product_images.*' => 'image|max:5120',
        ]);

        $paths = [];
        foreach ($request->file('product_images') as $index => $file) {
            $slug = Str::slug($request->input('product_name'));
            $counter = $index + 1;
            $extension = $file->getClientOriginalExtension() ?: 'jpg';
            $fileName = "{$slug}_{$counter}.{$extension}";

            // Store raw key — ImageResolver builds the URL at render time
            $path = $file->storeAs('uploads/items', $fileName, 's3');

            // Return the resolved URL for the immediate upload response
            $paths[] = ImageResolver::resolve($path);
        }

        return response()->json(['paths' => $paths]);
    }
}
