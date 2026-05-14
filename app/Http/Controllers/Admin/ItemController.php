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
        // 1. Eager load everything needed for the counts to avoid N+1 issues
        $items = Item::with(['variants.storeVariants'])->get();
        $stores = Store::all();

        $items = $items->map(function ($item) {
            // 2. Leverage the Accessors we built in the Model
            // We take the general images and merge them with variant images
            $previewImages = collect($item->general_images ?? [])
                ->map(fn($path) => Storage::exists($path) ? Storage::url($path) : asset('images/defaults/no-image.png'))
                ->merge($item->variants->map(fn($v) => $v->image_url)) // Uses the ItemVariant accessor
                ->filter()
                ->unique()
                ->take(5)
                ->values();

            // 3. Logic remains the same, but cleaner
            $item->variants_count = $item->variants->count();

            $item->active_variants_count = $item->variants->filter(function ($v) {
                return $v->status === 'active' &&
                    $v->storeVariants->where('active', true)->isNotEmpty();
            })->count();

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
        // 1. Eager load everything for the detail view
        $item->load([
            'category',
            'variants.color',
            'variants.size',
            'variants.itemPackagingType',
            'variants.stocks'
        ]);

        // 2. Map the item to include all processed image URLs
        $itemData = [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'product_description' => $item->product_description,
            'status' => $item->status,
            'category_name' => $item->category?->name ?? 'Uncategorized',

            // Use the accessor for general images
            'general_images' => collect($item->general_images ?? [])
                ->map(fn($path) => Storage::exists($path) ? Storage::url($path) : asset('images/defaults/no-image.png'))
                ->toArray(),

            // Process variants to use their individual MinIO accessors
            'variants' => $item->variants->map(function ($variant) {
                return [
                    'id' => $variant->id,
                    'sku' => $variant->sku,
                    'color' => $variant->color?->name,
                    'size' => $variant->size?->name,
                    'packaging' => $variant->itemPackagingType?->name,
                    'stock_count' => $variant->stocks->sum('quantity'),
                    'status' => $variant->status,
                    // Accessors we built earlier:
                    'main_image' => $variant->image_url,
                    'all_images' => $variant->all_image_urls,
                ];
            }),
        ];

        return Inertia::render('Admin/Items/Show', [
            'item' => $itemData,
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
                'it em_category_id' => $this->resolveCategoryId($validated['item_category_id']),
                'status' => 'draft',           // always draft until proof provided
                'general_images' => $this->handleUploads($request, []), // Pass empty array for new items
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
            // Eager load variants to avoid the N+1 problem on the Pi's CPU
            $item->load('variants');

            $allProven = $item->variants->every(function ($variant) {
                // Since your ItemVariant model uses: protected $casts = ['images' => 'array'],
                // $variant->images is ALREADY an array or null.
                $images = $variant->images ?? [];
                return count($images) >= 2;
            });

            if (!$allProven) {
                return back()->withErrors([
                    'status' => 'Cannot activate: every variant must have at least 2 images (proof) before publishing.'
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
        // Build a lookup: comboKey → variant
        $item->load('variants');

        // 1. Direct ID-based mapping (The most reliable way)
        foreach ($item->variants as $variant) {
            $fileKey = "variant_image_{$variant->id}";

            if ($request->hasFile($fileKey)) {
                $file = $request->file($fileKey);

                // Standardizing the SKU folder path
                $fileName = "{$variant->sku}_main." . $file->getClientOriginalExtension();
                $path = $file->storeAs("uploads/variants/{$variant->sku}", $fileName, 's3');

                // Update the JSON column (casted as array in your model)
                $variant->update(['images' => [$path]]);
            }
        }

        $newFiles = $request->file('variant_images', []);
        $existingPaths = $request->input('variant_existing_images', []);

        foreach ($item as $key => $variant) {
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
        $newPaths = [];

        if ($request->hasFile('general_images')) {
            foreach ($request->file('general_images') as $file) {
                $name = Str::slug($request->product_name) . '_' . time() . '_' . Str::random(5) . '.' . $file->getClientOriginalExtension();

                // Store to MinIO
                $path = $file->storeAs('products', $name, 's3');
                $newPaths[] = $path;
            }
        }

        // Merge existing image paths from the DB with the newly uploaded paths
        return array_merge($existingImages, $newPaths);
    }

    /**
     * Modernized upload endpoint for MinIO
     */
    public function uploadImages(Request $request)
    {
        $request->validate([
            'product_images' => 'required|array',
            'product_images.*' => 'image|max:5120'
        ]);

        $paths = [];
        foreach ($request->file('product_images') as $file) {
            // Store the file
            $path = $file->store('images/product_images', 's3');

            // Force the URL generation using the facade directly
            $paths[] = Storage::disk('s3')->url($path);
        }

        return response()->json(['paths' => $paths]);
    }
}
