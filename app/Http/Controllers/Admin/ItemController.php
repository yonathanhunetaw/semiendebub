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
use App\Models\Store\StoreVariant;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
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
    // Display a listing of the items
    public function index()
    {
        $items = Item::with(['variants.stocks.inventoryLocation'])->get();

        $stores = Store::all();

        // Add total stock and active variants count per item
        $items = $items->map(function ($item) {
            $item->active_variants_count = $item->variants->where('is_active', 1)->count();
            $item->total_stock = $item->variants->sum(function ($variant) {
                return $variant->stocks->sum('quantity');
            });

            return $item;
        });

        \Log::info('ITEM VARIANT STORES DEBUG', [
            'items' => $items->map(function ($item) use ($stores) {
                return [
                    'item_id' => $item->id,
                    'item_name' => $item->product_name,
                    'variants' => $item->variants->map(function ($variant) use ($stores) {
                        return [
                            'variant_id' => $variant->id,
                            'stores' => $stores->map(function ($store) use ($variant) {
                                $stock = $variant->stocks->firstWhere('item_inventory_location_id', $store->id);

                                return [
                                    'store_id' => $store->id,
                                    'store_name' => $store->name,
                                    'stock' => $stock?->quantity ?? 0,
                                    'price' => $variant->price, // or custom price logic
                                ];
                            }),
                        ];
                    }),
                ];
            }),
        ]);

        //        return view('admin.items.index', compact('items', 'stores'));

        return Inertia::render('Admin/Items/Index', [
            'items' => $items,
            'stores' => $stores,
            'filters' => request()->only(['filter', 'sort', 'direction']), // Pass these for your React logic
        ]);
    }

    public function show(Item $item)
    {
        // 1️⃣ Eager load EVERYTHING in one go
        // Use 'load' because Laravel already gave us the $item instance
        $item->load([
            'category.parent',
            'colors',
            'sizes',
            'packagingTypes',
            'variants.itemColor',
            'variants.itemSize',
            'variants.itemPackagingType',
            'variants.storeVariants.SellerPrices' => function ($query) {
                $query->where('seller_id', auth()->id())->where('active', 1);
            }
        ]);

        // Log the current session's cart specifically here
        logger('Cart check in ItemController', [
            'session_cart' => session('cart'),
            'db_cart' => auth()->user()?->cart
        ]);

        logger('Step 1 & 2: Relations loaded via lazy-eager loading', ['item_id' => $item->id]);

        // 2️⃣ Use the already loaded relations (No extra queries triggered here)
        $colors = $item->colors;
        $sizes = $item->sizes;
        $packagingTypes = $item->packagingTypes;

        // These still need their own queries as they aren't directly tied to this $item
        $inventoryLocations = ItemInventoryLocation::all();
        $sellers = User::where('role', 'seller')->get();

        // 3️⃣ Decode item images
        $itemImages = [];
        if ($item->product_images) {
            $clean = preg_replace('/[^\[\]{}",:a-zA-Z0-9_\.\-\/]/', '', $item->product_images);
            $itemImages = json_decode($clean, true) ?: [];
        }
        logger('Step 3: Decoded item images', ['itemImages' => $itemImages]);

        // 4️⃣ Prepare variant data
        // ✅ Prepare variant data including only variant images
        $variantData = $item->variants->map(function ($variant) {
            // Ensure $images is always an array
            $images = is_array($variant->images) ? $variant->images : (json_decode($variant->images, true) ?: []);

            if ($variant->images) {
                if (is_array($variant->images)) {
                    $images = $variant->images;
                } elseif (is_string($variant->images)) {
                    $images = json_decode($variant->images, true);
                    if (!is_array($images)) {
                        $images = [];
                    }
                }
            }

            return [
                'color' => $variant->itemColor->name ?? null,
                'size' => $variant->itemSize->name ?? null,
                'packaging' => $variant->itemPackagingType->name ?? null,
                'img' => !empty($images) ? asset('storage/' . $images[0]) : '/img/default.jpg',
                'images' => array_map(
                    fn($i) => asset('storage/' . ltrim($i, '/')),
                    $images
                ),

                'price' => $variant->price,
                'stock' => $variant->stock,
                'disabled' => $variant->status !== 'active',
            ];
        });

        logger('Step 4: Prepared variant data', ['variantData' => $variantData->toArray()]);

        // 5️⃣ Merge all images (item + variant images)
        $variantImages = $item->variants->pluck('images')
            ->filter()
            ->map(function ($img) {
                if (is_string($img)) {
                    return json_decode($img, true);
                }

                return $img;
            })
            ->flatten()
            ->toArray();
        logger('Step 5: Flattened variant images', ['variantImages' => $variantImages]);

        $allImages = array_values(array_unique(array_merge($itemImages, $variantImages)));
        logger('Step 6: Merged all images', ['allImages' => $allImages]);

        // 6️⃣ Return view
        //        return view('Admin/Items/Show', [
        //            'item',
        //            'colors',
        //            'sizes',
        //            'packagingTypes',
        //            'sellers',
        //            'inventoryLocations',
        //            'variantData', // pass only variant images
        //        ]);

        //        return Inertia::render('Admin/Items/Index', [
        //            'items' => $items,
        //            'stores' => $stores,
        //            'filters' => request()->only(['filter', 'sort', 'direction']), // Pass these for your React logic
        //        ]);
        // 6️⃣ Return Inertia Render
        return Inertia::render('Admin/Items/Show', [
            'item' => $item,
            'colors' => $colors,
            'sizes' => $sizes,
            'packagingTypes' => $packagingTypes,
            'sellers' => $sellers,
            'inventoryLocations' => $inventoryLocations,
            'variantData' => $variantData,
            'allImages' => array_map(fn($img) => asset('storage/' . $img), $allImages),
        ]);
    }

    // Store a newly created item

    public function edit(Item $item)
    {
        $item->load([
            'category',
            'colors',
            'sizes',
            'packagingTypes' => fn($query) => $query->withPivot('quantity'),
            'variants' => fn($query) => $query
                ->with(['itemColor', 'itemSize', 'storeVariants.store'])
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

    // Show the details of a specific item

    public function destroy(Item $item)
    {
        $item->delete();

        return redirect()->route('admin.items.index')->with('success', 'Item deleted successfully.');
    }

    // Show the form for editing the specified item

    public function saveDraft(Request $request)
    {
        Log::info('First Log -> Draft save request received. ItemController -> saveDraft');
        Log::info('Second Log -> Request Data:', $request->all());

        // Start a database transaction
        DB::beginTransaction();
        try {
            // Validate form data
            $validatedData = $request->validate([
                'product_name' => 'required|string|max:255',
                'product_description' => 'nullable|string',

                'packaging_details' => 'nullable|string',

                'selectedCategories' => 'nullable|string', // Will be JSON encoded array of category IDs
                'newCategoryNames' => 'nullable|string', // Will be JSON encoded array of new category names

                'product_images' => 'nullable|array',
                'product_images.*' => 'image|mimes:jpeg,png,jpg,gif,svg|max:2048',

            ]);

            Log::info('Validation passed for save draft.', $validatedData);

            Log::info('Request Data:', $request->all());

            // Decode JSON inputs
            $selectedCategories = json_decode($request->input('selectedCategories', '[]'), true);
            $newCategoryNames = json_decode($request->input('newCategoryNames', '[]'), true);

            // Determine completeness
            $requiredFields = ['product_name', 'product_description', 'category_id', 'product_images'];
            $isComplete = true;
            foreach ($requiredFields as $field) {
                if ($field === 'category_id' && empty($selectedCategories) && empty($newCategoryNames)) {
                    $isComplete = false;
                    break;
                }
                if ($field === 'product_images' && !$request->hasFile('product_images')) {
                    $isComplete = false;
                    break;
                }
                if (in_array($field, ['product_name', 'product_description']) && empty($request->input($field))) {
                    $isComplete = false;
                    break;
                }
            }

            // Create the item
            $item = new Item;
            $item->product_name = $request->input('product_name');
            $item->product_description = $request->input('product_description');
            $item->packaging_details = $request->input('packaging_details') ?? null;

            // Status always inactive initially
            $item->status = 'inactive';
            $item->incomplete = !$isComplete; // true if incomplete, false if complete

            // Handle images

            if ($request->hasFile('product_images')) {
                $paths = [];
                foreach ($request->file('product_images') as $file) {
                    // Store file in public disk
                    $path = $file->store('images/product_images', 'public');
                    $paths[] = 'storage/' . $path; // relative path for Blade asset()
                }
                // Save JSON array of paths
                $item->product_images = json_encode($paths);
            }

            $item->save();

            Log::info('Saved item product_images JSON:', ['product_images' => $item->product_images]);

            // Handle existing and new categories
            // ✅ Handle existing & new categories (Dynamic categories like colors/sizes)
            $existingCategoryIds = $request->input('categories', []);  // array of existing IDs
            $newCategoryNames = $request->input('newCategories', []);  // array of new names

            Log::info('Categories received:', [
                'existing' => $existingCategoryIds,
                'new' => $newCategoryNames,
            ]);

            // ✅ Create new categories and collect IDs
            foreach ($newCategoryNames as $name) {
                if (!empty($name)) {
                    $cat = ItemCategory::firstOrCreate(['category_name' => $name]);
                    $existingCategoryIds[] = $cat->id;
                }
            }

            // ✅ Attach all category IDs to item
            if (!empty($existingCategoryIds)) {
                $item->categories()->sync($existingCategoryIds);
            }

            Log::info('Final attached categories:', $existingCategoryIds);

            // Colors
            $colorIds = $request->input('colors', []); // existing color IDs
            $newColorNames = $request->input('newColors', []); // new color names

            foreach ($newColorNames as $name) {
                if (!empty($name)) {
                    $color = ItemColor::firstOrCreate(['name' => $name]);
                    $colorIds[] = $color->id;
                }
            }
            $item->colors()->sync($colorIds);

            // Sizes
            $sizeIds = $request->input('sizes', []);
            $newSizeNames = $request->input('newSizes', []);

            foreach ($newSizeNames as $name) {
                if (!empty($name)) {
                    $size = ItemSize::firstOrCreate(['name' => $name]);
                    $sizeIds[] = $size->id;
                }
            }
            $item->sizes()->sync($sizeIds);

            // Packaging
            $packIds = $request->input('packaging', []);

            $packIdsWithQuantity = collect($packIds)->mapWithKeys(function ($id) use ($request) {

                // Handle custom packs
                if (str_starts_with($id, 'custom_')) {
                    $name = $request->input("custom_pack_name.$id"); // get the name
                    $pack = ItemPackagingType::create([
                        'name' => $name,
                        'quantity' => $request->input("packaging_qty.$id", 1),
                    ]);
                    $id = $pack->id; // replace temporary string ID with numeric ID
                }

                return [$id => ['quantity' => $request->input("packaging_qty.$id", 1)]];
            })->toArray();

            $item->packagingTypes()->sync($packIdsWithQuantity);

            // Commit the transaction
            DB::commit();

            Log::info('Draft saved successfully.');

            return response()->json([
                'success' => true,
                'message' => $isComplete ? 'Item saved as complete (inactive)' : 'Item saved as draft (inactive)',
            ]);

        } catch (Exception $e) {
            DB::rollBack();

            Log::error('Error saving draft:', ['exception' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);

            return response()->json([
                'success' => false,
                'message' => 'Error saving draft.',
                'error' => $e->getMessage(), // Show actual error
            ], 500);
        }
    }

    // Update the specified item

    public function store(Request $request)
    {
        $validated = $this->validateItemPayload($request);

        return DB::transaction(function () use ($request, $validated) {
            $item = Item::create([
                'product_name' => $validated['product_name'],
                'product_description' => $validated['product_description'] ?? null,
                'packaging_details' => $validated['packaging_details'] ?? null,
                'item_category_id' => $this->resolveCategoryId($validated['item_category_id']),
                'status' => $validated['status'],
                'general_images' => $this->handleUploads($request),
                'is_incomplete' => false,
            ]);

            $item->colors()->sync($this->resolveOptionIds($validated['color_ids'] ?? [], ItemColor::class));
            $item->sizes()->sync($this->resolveOptionIds($validated['size_ids'] ?? [], ItemSize::class));
            $item->packagingTypes()->sync($this->resolvePackagingPayload($validated['packaging'] ?? []));
            $this->syncGeneratedVariants($item);

            return redirect()->route('admin.items.index');
        });
    }

    private function handleUploads($request, array $existingImages = [])
    {
        $paths = collect($existingImages)
            ->filter()
            ->map(function ($path) {
                return str_starts_with($path, '/storage/')
                    ? ltrim(str_replace('/storage/', '', $path), '/')
                    : ltrim($path, '/');
            })
            ->values()
            ->all();

        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $paths[] = $image->store('uploads/items', 'public');
            }
        }

        return $paths;
    }

    // Remove the specified item

    public function create()
    {
        return Inertia::render('Admin/Items/Create', [
            'categories' => ItemCategory::all(),
            'colors' => ItemColor::all(),
            'sizes' => ItemSize::all(),
            'packagingTypes' => ItemPackagingType::all(),
            'sellers' => User::where('role', 'seller')->get(),
        ]);
    }

    // Save Draft method/////////////////////////////////////////////////////////////////////////////////////////

    public function update(Request $request, Item $item)
    {
        $validated = $this->validateItemPayload($request);

        return DB::transaction(function () use ($request, $item, $validated) {
            $item->update([
                'product_name' => $validated['product_name'],
                'product_description' => $validated['product_description'] ?? null,
                'packaging_details' => $validated['packaging_details'] ?? null,
                'item_category_id' => $this->resolveCategoryId($validated['item_category_id']),
                'status' => $validated['status'],
                'general_images' => $this->handleUploads($request, $validated['existing_images'] ?? []),
                'is_incomplete' => false,
            ]);

            $item->colors()->sync($this->resolveOptionIds($validated['color_ids'] ?? [], ItemColor::class));
            $item->sizes()->sync($this->resolveOptionIds($validated['size_ids'] ?? [], ItemSize::class));
            $item->packagingTypes()->sync($this->resolvePackagingPayload($validated['packaging'] ?? []));
            $this->syncGeneratedVariants($item);

            return redirect()->route('admin.items.edit', $item)->with('success', 'Item updated successfully.');
        });
    }

    public function storeInlineOption(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:category,color,size,packaging',
            'name' => 'required|string|max:255',
        ]);

        $name = trim($validated['name']);

        [$modelClass, $nameColumn] = match ($validated['type']) {
            'category' => [ItemCategory::class, 'category_name'],
            'color' => [ItemColor::class, 'name'],
            'size' => [ItemSize::class, 'name'],
            'packaging' => [ItemPackagingType::class, 'name'],
        };

        $record = $modelClass::firstOrCreate([$nameColumn => $name]);

        return response()->json([
            'id' => $record->id,
            'name' => $record->{$nameColumn},
            'category_name' => $record->{$nameColumn},
        ]);
    }

    public function updateVariantStatus(Request $request, Item $item, ItemVariant $variant)
    {
        abort_unless($variant->item_id === $item->id, 404);

        $validated = $request->validate([
            'active' => 'required|boolean',
        ]);

        $active = (bool) $validated['active'];

        DB::transaction(function () use ($variant, $active) {
            $variant->update([
                'status' => $active ? 'active' : 'inactive',
            ]);

            $this->applyVariantAvailabilityToStores($variant, $active);
        });

        return back()->with('success', 'Variant availability updated successfully.');
    }

    public function destroyVariant(Item $item, ItemVariant $variant)
    {
        abort_unless($variant->item_id === $item->id, 404);

        DB::transaction(function () use ($variant) {
            $this->applyVariantAvailabilityToStores($variant, false);
            $variant->delete();
        });

        return back()->with('success', 'Variant deleted successfully.');
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
        ]);

        $validator->after(function ($validator) use ($request) {
            $existingCount = count($request->input('existing_images', []));
            $uploadCount = count($request->file('images', []));

            if (($existingCount + $uploadCount) > 10) {
                $validator->errors()->add('images', 'You can upload a maximum of 10 images per item.');
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

        return ItemCategory::firstOrCreate([
            'category_name' => trim((string) $value),
        ])->id;
    }

    private function resolveOptionIds(array $values, string $modelClass, string $nameColumn = 'name'): array
    {
        return collect($values)
            ->filter(fn($value) => $value !== null && $value !== '')
            ->map(function ($value) use ($modelClass, $nameColumn) {
                if (is_numeric($value)) {
                    return (int) $value;
                }

                return $modelClass::firstOrCreate([
                    $nameColumn => trim((string) $value),
                ])->id;
            })
            ->unique()
            ->values()
            ->all();
    }

    private function resolvePackagingPayload(array $packaging): array
    {
        return collect($packaging)
            ->filter(fn($row) => filled($row['item_packaging_type_id'] ?? null))
            ->mapWithKeys(function ($row) {
                $typeId = $row['item_packaging_type_id'];

                if (!is_numeric($typeId)) {
                    $typeId = ItemPackagingType::firstOrCreate([
                        'name' => trim((string) $typeId),
                    ])->id;
                }

                return [
                    (int) $typeId => [
                        'quantity' => max(1, (int) ($row['quantity'] ?? 1)),
                    ],
                ];
            })
            ->all();
    }

    private function syncGeneratedVariants(Item $item): void
    {
        $item->load(['colors', 'sizes', 'stores', 'variants' => fn($query) => $query->withTrashed()]);

        $colorIds = $item->colors->pluck('id')->all();
        $sizeIds = $item->sizes->pluck('id')->all();

        if (empty($colorIds)) {
            $colorIds = [null];
        }

        if (empty($sizeIds)) {
            $sizeIds = [null];
        }

        foreach ($colorIds as $colorId) {
            foreach ($sizeIds as $sizeId) {
                $variant = ItemVariant::withTrashed()->firstOrNew([
                    'item_id' => $item->id,
                    'item_color_id' => $colorId,
                    'item_size_id' => $sizeId,
                ]);

                if ($variant->trashed()) {
                    $variant->restore();
                }

                if (!$variant->exists) {
                    $variant->status = $item->status === 'active' ? 'active' : 'inactive';
                    $variant->packaging_total_pieces = 1;
                }

                $variant->save();
                $this->ensureStoreVariantRecords($item, $variant);
            }
        }
    }

    private function ensureStoreVariantRecords(Item $item, ItemVariant $variant): void
    {
        $storeIds = $item->stores()->pluck('stores.id');

        if ($storeIds->isEmpty()) {
            $storeIds = Store::query()->pluck('id');
        }

        foreach ($storeIds as $storeId) {
            StoreVariant::firstOrCreate(
                [
                    'store_id' => $storeId,
                    'item_variant_id' => $variant->id,
                ],
                [
                    'active' => $variant->status === 'active',
                    'manual_status' => $variant->status === 'active' ? 'auto' : 'forced',
                    'forced_status' => $variant->status === 'active' ? null : 'inactive',
                ]
            );
        }
    }

    private function applyVariantAvailabilityToStores(ItemVariant $variant, bool $active): void
    {
        $variant->loadMissing('item.stores', 'storeVariants');

        $this->ensureStoreVariantRecords($variant->item, $variant);
        $variant->load('storeVariants');

        foreach ($variant->storeVariants as $storeVariant) {
            $storeVariant->update([
                'active' => $active,
                'manual_status' => $active ? 'auto' : 'forced',
                'forced_status' => $active ? null : 'inactive',
            ]);
        }
    }

    public function uploadImages(Request $request)
    {
        $request->validate([
            'product_images' => 'required|array',
            'product_images.*' => 'image|max:5120', // 5MB max
        ]);

        $paths = [];
        foreach ($request->file('product_images') as $file) {
            $path = $file->store('images/product_images', 'public');
            $paths[] = 'storage/' . $path; // store relative path
        }

        // Here, instead of returning JSON, we return JS to redirect with a popup
        $redirect = route('admin.items.index');
        $message = 'Images uploaded successfully!';

        return response()->json([
            'redirect' => $redirect,
            'message' => $message,
            'paths' => $paths,
        ]);
    }

    public function updateStatus(Request $request, Item $item)
    {
        $request->validate([
            'status' => 'required|in:active,inactive,unavailable,draft',
        ]);

        $newStatus = $request->status;

        if ($newStatus === 'active') {
            $hasActiveVariants = $item->variants()->where('status', 'active')->exists();

            if (!$hasActiveVariants) {
                return back()->withErrors(['status' => 'Cannot set item to active because it has no active variants.']);
            }
        }

        $item->status = $newStatus;
        $item->save();

        // Send a success message for all four statuses
        return back()->with('success', 'Item status updated to ' . ucfirst($newStatus) . ' successfully.');
    }
}
