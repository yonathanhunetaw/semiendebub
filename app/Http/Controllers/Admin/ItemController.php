<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Services\ItemVariantGenerationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
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
        $items = Item::with(['variants.storeVariants', 'variants.stocks'])->get();
        $stores = Store::all();

        $items = $items->map(function ($item) {
            $previewImages = collect($item->general_images ?? [])
                ->merge($item->variants->pluck('images')->flatten(1)->filter())
                ->filter()
                ->map(function ($image) {
                    if (!is_string($image) || $image === '')
                        return null;
                    if (str_starts_with($image, 'http'))
                        return $image;
                    if (str_starts_with($image, '/images/') || str_starts_with($image, 'images/'))
                        return asset(ltrim($image, '/'));
                    return asset('storage/' . ltrim($image, '/'));
                })
                ->filter()->unique()->take(5)->values();

            $item->variants_count = $item->variants->count();
            $item->active_variants_count = $item->variants->filter(
                fn($v) =>
                $v->status === 'active' && $v->storeVariants->contains(fn($sv) => $sv->active)
            )->count();
            $item->preview_images = $previewImages;

            return $item;
        });

        return Inertia::render('Admin/Items/Index', [
            'items' => $items,
            'stores' => $stores,
            'filters' => request()->only(['filter', 'sort', 'direction']),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SHOW
    // ──────────────────────────────────────────────────────────────────────────



    // Drop-in replacement for ItemController::show().
// Add at the top of ItemController: use App\Models\Store;

    public function show(Item $item)
    {
        $item->load([
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.storeVariants.store', // ← go through variants first
        ]);

        // Build variantData for the React Show page
        $variantData = $item->variants->map(function ($variant) {
            $images = is_array($variant->images) ? $variant->images : [];

            $slots = collect($images)->map(fn($path) => [
                'path' => $path,
                'url' => str_starts_with($path, 'http') ? $path : asset("storage/{$path}"),
            ])->values()->toArray();

            return [
                'id' => $variant->id,
                'sku' => $variant->sku,
                'color' => $variant->itemColor?->name,
                'size' => $variant->itemSize?->name,
                'packaging' => $variant->itemPackagingType?->name,
                'status' => $variant->status,
                'slots' => $slots,
                'slot_count' => count($slots),
                'proof_ok' => count($slots) >= 2,
            ];
        });

        // Which store IDs already have at least one StoreVariant for this item?
        $deployedStoreIds = $item->variants
            ->flatMap(fn($v) => $v->storeVariants)
            ->pluck('store_id')
            ->unique()
            ->toArray();


        // Pass all active stores + whether each is already deployed
        $stores = Store::where('status', 'active')
            ->orderBy('name')
            ->get()
            ->map(fn($s) => [
                'id' => $s->id,
                'name' => $s->name,
                'location' => $s->location,
                'manager' => $s->manager,
                'status' => $s->status,
                'already_deployed' => in_array($s->id, $deployedStoreIds),
            ]);

        return Inertia::render('Admin/Items/Show', [
            'item' => [
                'id' => $item->id,
                'product_name' => $item->product_name,
                'product_description' => $item->product_description,
                'status' => $item->status,
                'general_images' => $item->general_images,
            ],
            'variantData' => $variantData,
            'stores' => $stores,
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
                'status' => 'draft',           // always draft until proof provided
                'general_images' => $this->handleUploads($request),
                'is_incomplete' => true,
            ]);

            $item->colors()->sync($this->resolveOptionIds($validated['color_ids'] ?? [], ItemColor::class));
            $item->sizes()->sync($this->resolveOptionIds($validated['size_ids'] ?? [], ItemSize::class));
            $item->packagingTypes()->sync($this->resolvePackagingPayload($validated['packaging'] ?? []));

            // Generate all variant rows
            $this->itemVariantGenerationService->sync($item);

            // Attach per-variant images (named by SKU)
            $this->persistVariantImages($request, $item);

            // Re-evaluate draft gate
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
        $item->load([
            'category',
            'colors',
            'sizes',
            'packagingTypes' => fn($q) => $q->withPivot('quantity'),
            'variants' => fn($q) => $q
                ->with(['itemColor', 'itemSize', 'itemPackagingType']) // REMOVED 'images' from here
                ->orderBy('id'),
        ]);

        return Inertia::render('Admin/Items/Edit', [
            'item' => $item,
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

            // Merge new uploads onto existing variant images
            $this->persistVariantImages($request, $item);

            // Re-evaluate draft gate
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
    // STATUS helpers  (item-level only — store activation is the store's job)
    // ──────────────────────────────────────────────────────────────────────────

    public function updateStatus(Request $request, Item $item)
    {
        $request->validate(['status' => 'required|in:active,inactive,unavailable,draft']);

        $newStatus = $request->status;

        if ($newStatus === 'active') {
            // Only allow if all variants have ≥2 images
            $allProven = $item->variants()->get()->every(function ($variant) {
                $images = is_array($variant->images)
                    ? $variant->images
                    : (json_decode($variant->images, true) ?: []);
                return count($images) >= 2;
            });

            if (!$allProven) {
                return back()->withErrors(['status' => 'Cannot activate: one or more variants still need at least 2 images.']);
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
        $item->load(['variants.itemColor', 'variants.itemSize', 'variants.itemPackagingType']);

        // Build a lookup: comboKey → variant
        $variantMap = [];
        foreach ($item->variants as $variant) {
            $key = implode(':', [
                $variant->item_color_id ?? 'null',
                $variant->item_size_id ?? 'null',
                $variant->item_packaging_type_id ?? 'null',
            ]);
            $variantMap[$key] = $variant;
        }

        $newFiles = $request->file('variant_images', []);
        $existingPaths = $request->input('variant_existing_images', []);

        foreach ($variantMap as $key => $variant) {
            $slots = array_fill(0, 5, null);  // 5-slot array, null = keep existing

            // Slot 0-4: keep existing paths sent from the form
            $existingSlotsForKey = $existingPaths[$key] ?? [];
            foreach ($existingSlotsForKey as $slotIndex => $path) {
                if (is_string($path) && $path !== '') {
                    $slots[(int) $slotIndex] = ltrim($path, '/');
                }
            }

            // Slot 0-4: overwrite with new uploads
            $newFilesForKey = $newFiles[$key] ?? [];
            foreach ($newFilesForKey as $slotIndex => $file) {
                if ($file && $file->isValid()) {
                    $sku = $variant->sku ?? ('variant_' . $variant->id);
                    $ext = $file->getClientOriginalExtension() ?: 'jpg';
                    $slotNumber = (int) $slotIndex + 1;  // 1-based in filename
                    $path = $file->storeAs(
                        'uploads/variants/' . $sku,
                        "{$sku}_{$slotNumber}.{$ext}",
                        'public'
                    );
                    $slots[(int) $slotIndex] = $path;
                }
            }

            // Merge: new slots override, existing non-null slots fill gaps,
            // server images fill the rest (don't erase what was already there)
            $existingImages = is_array($variant->images)
                ? $variant->images
                : (json_decode($variant->images, true) ?: []);

            $merged = [];
            for ($i = 0; $i < 5; $i++) {
                if ($slots[$i] !== null) {
                    $merged[] = $slots[$i];
                } elseif (isset($existingImages[$i])) {
                    $merged[] = $existingImages[$i];  // preserve untouched server image
                }
                // null + no server image → just skip (slot stays empty)
            }

            $variant->update(['images' => $merged]);
        }
    }

    /**
     * After images are saved, decide if the item can leave draft.
     * Every variant must have ≥2 images; otherwise lock to draft.
     */
    private function evaluateDraftStatus(Item $item, string $requestedStatus): void
    {
        $item->refresh()->load('variants');

        $allProven = $item->variants->every(function ($variant) {
            $images = is_array($variant->images)
                ? $variant->images
                : (json_decode($variant->images, true) ?: []);
            return count($images) >= 2;
        });

        $finalStatus = $allProven ? $requestedStatus : 'draft';
        $item->update(['status' => $finalStatus, 'is_incomplete' => !$allProven]);
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
            'images' => 'nullable|array|max:10',
            'images.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            // Variant images: flexible — each slot is an image file
            'variant_images' => 'nullable|array',
            'variant_images.*' => 'nullable|array',
            'variant_images.*.*' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            'variant_existing_images' => 'nullable|array',
        ]);

        $validator->after(function ($v) use ($request) {
            $existing = count($request->input('existing_images', []));
            $uploads = count($request->file('images', []));
            if (($existing + $uploads) > 10) {
                $v->errors()->add('images', 'Maximum 10 general images per item.');
            }
        });

        return $validator->validate();
    }

    private function resolveCategoryId(mixed $value): ?int
    {
        if ($value === null || $value === '')
            return null;
        if (is_numeric($value))
            return (int) $value;
        return ItemCategory::firstOrCreate(['category_name' => trim((string) $value)])->id;
    }

    private function resolveOptionIds(array $values, string $modelClass, string $nameColumn = 'name'): array
    {
        return collect($values)
            ->filter(fn($v) => $v !== null && $v !== '')
            ->map(function ($v) use ($modelClass, $nameColumn) {
                if (is_numeric($v))
                    return (int) $v;
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
        $paths = collect($existingImages)
            ->filter()
            ->map(fn($p) => str_starts_with($p, '/storage/') ? ltrim(str_replace('/storage/', '', $p), '/') : ltrim($p, '/'))
            ->values()->all();

        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $paths[] = $image->store('uploads/items', 'public');
            }
        }

        return $paths;
    }

    // Legacy upload endpoints kept for backward compat
    public function uploadImages(Request $request)
    {
        $request->validate(['product_images' => 'required|array', 'product_images.*' => 'image|max:5120']);
        $paths = [];
        foreach ($request->file('product_images') as $file) {
            $paths[] = 'storage/' . $file->store('images/product_images', 'public');
        }
        return response()->json(['paths' => $paths]);
    }
}
