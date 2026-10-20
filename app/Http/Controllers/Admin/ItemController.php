<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Item\BulkItemStatusRequest;
use App\Http\Requests\Item\ItemIndexRequest;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Admin\ItemCatalogue;
use App\Services\ImageResolver;
use App\Services\Item\ItemWriter;
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
        private readonly ItemVariantGenerationService $itemVariantGenerationService,
        private readonly ItemWriter $writer,
    ) {
    }

    // ──────────────────────────────────────────────────────────────────────────
    // INDEX
    // ──────────────────────────────────────────────────────────────────────────



    public function index(ItemIndexRequest $request, ItemCatalogue $catalogue)
    {
        $filters = $request->filters();

        return Inertia::render('Admin/Items/Index', [
            'items' => $catalogue->page($filters),
            'counts' => $catalogue->counts($filters),
            // Only read on the first visit; partial reloads leave it out.
            'categories' => fn () => $catalogue->categories(),
            'filters' => $filters,
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
            'stores'
        ]);

        // Debug: Log what images we're sending
        \Log::info('Item Show - General Images', [
            'item_id' => $item->id,
            'raw_general_images' => $item->general_images,
            'resolved_general_images' => !empty($item->general_images)
                ? ImageResolver::resolveAll($item->general_images)
                : [],
        ]);

        $variantData = $item->variants->map(function ($v) {
            $slots = $v->image_slots;
            $slotCount = collect($slots)->filter()->count();

            // Debug each variant's images
            \Log::info('Variant Images', [
                'variant_id' => $v->id,
                'sku' => $v->sku,
                'raw_images' => $v->images,
                'resolved_slots' => $v->image_slots,
            ]);

            return [
                'id' => $v->id,
                'sku' => $v->sku,
                'color' => $v->itemColor?->name,
                'size' => $v->itemSize?->name,
                'packaging' => $v->itemPackagingType?->name,
                'status' => $v->status,
                'slots' => $slots,
                'slot_count' => $slotCount,
                // The publish gate. A packaging tier satisfies it because the
                // UI can draw a truthful PackagingPlaceholder for one.
                'proof_ok' => $v->hasImageProof(),
                // Advisory only: whether real photographs exist. The admin
                // list still flags "needs photos" on a variant that is
                // publishable, so missing photography stays visible.
                'has_photos' => $v->hasPhotographicProof(),
                'packaging_tier' => $v->packagingTier(),
                'packaging_data' => $v->packagingQuantities->map(fn($p) => [
                    'name' => $p->name,
                    'pivot' => [
                        'quantity' => $p->pivot->quantity,
                        'cbm' => $p->pivot->cbm
                    ]
                ])->values()->toArray(),
            ];
        });

        return Inertia::render('Admin/Items/Show', [
            'item' => [
                'id' => $item->id,
                'product_name' => $item->product_name,
                'product_description' => $item->product_description,
                'status' => $item->status,
                'general_images' => !empty($item->general_images)
                    ? ImageResolver::resolveAll($item->general_images)
                    : [],
            ],
            'variantData' => $variantData,
            // The deploy dialog reads `already_deployed` to mark a store it has
            // nothing left to push to. Plain Store::all() never carried the
            // flag, so every store offered a "Deploy" button whether or not it
            // already held the item, and the only way to find out was to press
            // it and read the "already deployed" notice that came back.
            'stores' => $this->storesWithDeployment($item),
        ]);
    }

    /**
     * Every store, each saying whether this item is fully deployed to it.
     *
     * "Fully" is the useful question: deployment is per variant, so a store
     * that received an item before a new colour was added still has variants
     * waiting, and should keep its Deploy button.
     *
     * @return array<int, array<string, mixed>>
     */
    private function storesWithDeployment(Item $item): array
    {
        $variantCount = $item->variants->count();

        $deployedPerStore = StoreVariant::query()
            ->where('item_id', $item->id)
            ->selectRaw('store_id, COUNT(DISTINCT item_variant_id) as deployed')
            ->groupBy('store_id')
            ->pluck('deployed', 'store_id');

        return Store::query()
            ->orderBy('name')
            ->get()
            ->map(function (Store $store) use ($deployedPerStore, $variantCount): array {
                $deployed = (int) ($deployedPerStore[$store->id] ?? 0);

                return [
                    'id' => (int) $store->id,
                    'name' => (string) $store->name,
                    'location' => $store->location,
                    'deployed_variants' => $deployed,
                    'total_variants' => $variantCount,
                    'already_deployed' => $variantCount > 0 && $deployed >= $variantCount,
                ];
            })
            ->values()
            ->all();
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
                // Placeholder only: evaluateDraftStatus() below writes the
                // status the admin actually asked for, once variants and their
                // images have been persisted.
                'status' => 'draft',
                'general_images' => $this->handleUploads($request, []),
                'is_incomplete' => true,
            ]);

            $item->colors()->sync($this->resolveOptionIds($validated['color_ids'] ?? [], ItemColor::class));
            $item->sizes()->sync($this->resolveOptionIds($validated['size_ids'] ?? [], ItemSize::class));
            $item->packagingTypes()->sync($this->resolvePackagingPayload($validated['packaging'] ?? []));

            $this->itemVariantGenerationService->sync($item);

            $this->persistVariantImages($request, $item);

            $this->evaluateDraftStatus($item, $validated['status']);

            return redirect()->route('admin.items.setup', $item)
                ->with('success', 'Item created successfully.');
        });
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

            return redirect()->route('admin.items.setup', $item)
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
            // A new category can sit under an existing one.
            'parent_id' => 'nullable|integer|exists:item_categories,id',
        ]);

        [$modelClass, $nameColumn] = match ($validated['type']) {
            'category' => [ItemCategory::class, 'category_name'],
            'color' => [ItemColor::class, 'name'],
            'size' => [ItemSize::class, 'name'],
            'packaging' => [ItemPackagingType::class, 'name'],
        };

        $record = $modelClass::firstOrCreate(
            [$nameColumn => trim($validated['name'])] + ($validated['type'] === 'category' ? ['parent_id' => $validated['parent_id'] ?? null] : []),
        );

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

        $this->applyStatus($item, $newStatus);

        return back()->with('success', 'Item status updated to ' . ucfirst($newStatus) . '.');
    }

    /** One status for every item ticked on the list page. */
    public function bulkUpdateStatus(BulkItemStatusRequest $request)
    {
        $status = $request->validated('status');

        $items = Item::with('variants.itemPackagingType')
            ->whereIn('id', $request->validated('ids'))
            ->get();

        DB::transaction(function () use ($items, $status) {
            $items->each(fn (Item $item) => $this->applyStatus($item, $status));
        });

        $count = $items->count();

        return back()->with('success', "{$count} " . Str::plural('item', $count) . ' set to ' . ucfirst($status) . '.');
    }

    private function applyStatus(Item $item, string $status): void
    {
        // Activation is no longer gated on imagery. A variant with no
        // photograph renders PackagingPlaceholder, which is a truthful thing
        // to show, and refusing activation instead hid the item from every
        // seller's catalogue. The thin-imagery hint lives on `is_incomplete`.
        $item->loadMissing('variants.itemPackagingType');

        $item->update([
            'status' => $status,
            'is_incomplete' => ! $item->variants->every(
                fn (ItemVariant $variant): bool => $variant->hasImageProof(),
            ),
        ]);
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

    // The rules live in ItemWriter, which the item setup page uses too.

    private function persistVariantImages(Request $request, Item $item): void
    {
        $this->writer->persistVariantImages($request, $item);
    }

    private function evaluateDraftStatus(Item $item, string $requestedStatus): void
    {
        $this->writer->evaluateDraftStatus($item, $requestedStatus);
    }

    private function validateItemPayload(Request $request): array
    {
        return $this->writer->validate($request);
    }

    private function resolveCategoryId(mixed $value): ?int
    {
        return $this->writer->resolveCategoryId($value);
    }

    private function resolveOptionIds(array $values, string $modelClass, string $nameColumn = 'name'): array
    {
        return $this->writer->resolveOptionIds($values, $modelClass, $nameColumn);
    }

    private function resolvePackagingPayload(array $packaging): array
    {
        return $this->writer->resolvePackagingPayload($packaging);
    }

    private function handleUploads(Request $request, array $existingImages = []): array
    {
        return $this->writer->generalImages($request, $existingImages);
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
            $path = $file->storeAs('uploads/items', $fileName, 'r2');

            // Return the resolved URL for the immediate upload response
            $paths[] = ImageResolver::resolve($path);
        }

        return response()->json(['paths' => $paths]);
    }
}
