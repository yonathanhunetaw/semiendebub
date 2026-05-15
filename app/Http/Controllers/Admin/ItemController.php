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
                ->map(function ($path) {
                    try {
                        // Check if it exists on your MinIO/S3 disk
                        return Storage::disk('s3')->exists($path)
                            ? Storage::url($path)
                            : asset('images/defaults/no-image.png');
                    } catch (\Throwable $e) {
                        // If MinIO is down or misconfigured, gracefully fall back to default
                        return asset('images/defaults/no-image.png');
                    }
                })
                ->merge($item->variants->map(fn($v) => $v->image_url))
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
        $item->load([
            'category',
            'variants.color',
            'variants.size',
            'variants.itemPackagingType',
            'variants.stocks'
        ]);

        $itemData = [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'product_description' => $item->product_description,
            'status' => $item->status,
            'general_images' => $item->processed_images->toArray(), // Returns fully resolved URLs from MinIO
        ];

        // 🔄 Map your variants to match the dynamic 5-slot front-end interface format exactly
        $variantData = $item->variants->map(function ($variant) {
            // Read raw storage keys safely
            $rawPaths = is_array($variant->images) ? $variant->images : [];
            // Read fully resolved MinIO URLs processed via our accessor safety nets
            $resolvedUrls = $variant->all_image_urls;

            $slots = [];
            foreach ($rawPaths as $index => $path) {
                if (isset($resolvedUrls[$index])) {
                    $slots[] = [
                        'path' => $path,                 // Raw bucket location (e.g. uploads/variants/...)
                        'url' => $resolvedUrls[$index], // Fully qualified MinIO HTTP address
                    ];
                }
            }

            $slotCount = count($slots);

            return [
                'id' => $variant->id,
                'sku' => $variant->sku,
                'color' => $variant->color?->name,
                'size' => $variant->size?->name,
                'packaging' => $variant->itemPackagingType?->name,
                'status' => $variant->status,
                'slots' => $slots,                       // Matches dynamic Front-End ImageSlotData format
                'slot_count' => $slotCount,
                'proof_ok' => $slotCount >= 2,           // Verification gate matches model criteria
            ];
        });

        return Inertia::render('Admin/Items/Show', [
            'item' => $itemData,
            'variantData' => $variantData,
            'stores' => \App\Models\Store\Store::all(), // Add deployment target query lists here
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
                ->with(['itemColor', 'itemSize', 'itemPackagingType'])
                ->orderBy('id'),
        ]);

        // Build a safe data contract for your React editing fields
        $itemData = [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'product_description' => $item->product_description,
            'packaging_details' => $item->packaging_details,
            'item_category_id' => $item->item_category_id,
            'status' => $item->status,

            // 🔄 Use your bulletproof MinIO accessors so React gets valid file links
            'general_images' => $item->processed_images->toArray(),
            'raw_general_images' => $item->general_images ?? [], // Handy if your form inputs need raw paths for tracking deletions

            'colors' => $item->colors->map(fn($c) => $c->id)->toArray(),
            'sizes' => $item->sizes->map(fn($s) => $s->id)->toArray(),
            'packaging' => $item->packagingTypes->map(fn($p) => [
                'item_packaging_type_id' => $p->id,
                'quantity' => $p->pivot->quantity
            ])->toArray(),

            'variants' => $item->variants->map(function ($variant) {
                return [
                    'id' => $variant->id,
                    'sku' => $variant->sku,
                    'color_id' => $variant->item_color_id,
                    'size_id' => $variant->item_size_id,
                    'item_packaging_type_id' => $variant->item_packaging_type_id,
                    'status' => $variant->status,
                    // Safe image strings/arrays
                    'main_image' => $variant->image_url,
                    'all_images' => $variant->all_image_urls,
                    'raw_images' => $variant->images ?? [],
                ];
            }),
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
        // Ensure variants are fresh and loaded
        $item->load('variants');

        // Pull raw file arrays and existing track inputs from the request structure
        $newFiles = $request->file('variant_images', []);
        $existingPaths = $request->input('variant_existing_images', []);

        // 🔄 Loop over the collection relationship properly
        foreach ($item->variants as $variant) {

            // --- STEP 1: Direct Single Image Fast-Track ---
            $fileKey = "variant_image_{$variant->id}";
            if ($request->hasFile($fileKey)) {
                $file = $request->file($fileKey);
                $fileName = "{$variant->sku}_main." . $file->getClientOriginalExtension();

                // Unify tracking to the default 's3' MinIO disk setup
                $path = $file->storeAs("uploads/variants/{$variant->sku}", $fileName, 's3');
                $variant->update(['images' => [$path]]);
                continue; // Skip complex multi-slot evaluation if direct mapping took place
            }

            // --- STEP 2: Multi-Slot Array Setup (Slots 0 to 4) ---
            $slots = array_fill(0, 5, null);  // 5-slot array frame, null = keep existing

            // Use the variant's concrete ID as the key instead of the loop iteration counter
            $variantKey = $variant->id;

            // Map over existing paths sent from the view/form
            $existingSlotsForKey = $existingPaths[$variantKey] ?? [];
            foreach ($existingSlotsForKey as $slotIndex => $path) {
                if (is_string($path) && $path !== '') {
                    $slots[(int) $slotIndex] = ltrim($path, '/');
                }
            }

            // Handle and process any incoming new multi-slot file uploads
            $newFilesForKey = $newFiles[$variantKey] ?? [];
            foreach ($newFilesForKey as $slotIndex => $file) {
                if ($file && $file->isValid()) {
                    $sku = $variant->sku ?? ('variant_' . $variant->id);
                    $ext = $file->getClientOriginalExtension() ?: 'jpg';
                    $slotNumber = (int) $slotIndex + 1;  // Human readable file index suffix

                    // 🔄 CRITICAL FIX: Save to 's3' instead of 'public' so MinIO handles it
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
                    $merged[] = $existingImages[$i];  // Preserve untouched server paths
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

        // Enforce business rule validation: Force to draft if asset threshold is not met
        $finalStatus = $allProven ? $requestedStatus : 'draft';

        $item->update([
            'status' => $finalStatus,
            'is_incomplete' => !$allProven
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

            // 🔄 CRITICAL FIX: Standardized key to 'general_images' to match your storage routine
            'general_images' => 'nullable|array|max:10',
            'general_images.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',

            // Variant images array setup
            'variant_images' => 'nullable|array',
            'variant_images.*' => 'nullable|array',
            'variant_images.*.*' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            'variant_existing_images' => 'nullable|array',
        ]);

        // Inline validation adjustment for file thresholds
        $validator->after(function ($v) use ($request) {
            $existing = count($request->input('existing_images', []));
            // 🔄 CRITICAL FIX: Checked files using the matched key
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

        // Keys now align with the validated parameters upstream
        if ($request->hasFile('general_images')) {
            foreach ($request->file('general_images') as $file) {
                $name = Str::slug($request->product_name) . '_' . time() . '_' . Str::random(5) . '.' . $file->getClientOriginalExtension();

                // Store to MinIO using our verified S3 disk adapter configurations
                $path = $file->storeAs('products', $name, 's3');
                $newPaths[] = $path;
            }
        }

        // Merge legacy records with new object storage prefixes cleanly
        return array_merge($existingImages, $newPaths);
    }

    /**
     * Modernized upload endpoint for MinIO
     */

    public function uploadImages(Request $request)
    {
        $request->validate([
            'product_name' => 'required|string', // Pass this from the frontend form to name your files semantically
            'product_images' => 'required|array',
            'product_images.*' => 'image|max:5120'
        ]);

        $paths = [];
        foreach ($request->file('product_images') as $index => $file) {
            // Build a clean, structured filename matching your "Duka" product layout rules
            $slug = Str::slug($request->input('product_name'));
            $counter = $index + 1;
            $extension = $file->getClientOriginalExtension() ?: 'jpg';

            // Example output path: images/product_images/noteit_sticky_note_1.jpg
            $fileName = "{$slug}_{$counter}.{$extension}";
            $directory = 'images/product_images';

            // 🔄 storeAs gives you exact filename control over the object key in MinIO
            $path = $file->storeAs($directory, $fileName, 's3');

            // Force the URL generation using the facade directly to bypass any driver contract quirks
            $paths[] = Storage::disk('s3')->url($path);
        }

        return response()->json(['paths' => $paths]);
    }
}
