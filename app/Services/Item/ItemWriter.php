<?php

declare(strict_types=1);

namespace App\Services\Item;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use App\Services\ItemVariantGenerationService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Everything that writes an item's own data: its basics, pictures, colours / sizes / packaging,
 * the variants generated from them, and their barcodes. The item setup page and the older item
 * controller both go through here, so there is one set of rules.
 */
final class ItemWriter
{
    public const MAX_GENERAL_IMAGES = 10;

    public const VARIANT_SLOTS = 5;

    public function __construct(private readonly ItemVariantGenerationService $generator)
    {
    }

    // ── validating ──────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function validate(Request $request): array
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
            'existing_images' => 'nullable|array|max:'.self::MAX_GENERAL_IMAGES,
            'existing_images.*' => 'string',
            'general_images' => 'nullable|array|max:'.self::MAX_GENERAL_IMAGES,
            'general_images.*' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            'variant_images' => 'nullable|array',
            'variant_images.*' => 'nullable|array',
            'variant_images.*.*' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            'variant_existing_images' => 'nullable|array',
        ]);

        $validator->after(function ($v) use ($request): void {
            $existing = count($request->input('existing_images', []));
            $uploads = count($request->file('general_images', []));

            if (($existing + $uploads) > self::MAX_GENERAL_IMAGES) {
                $v->errors()->add('general_images', 'Maximum '.self::MAX_GENERAL_IMAGES.' general images per item total.');
            }
        });

        return $validator->validate();
    }

    // ── resolving what the form sends (an id, or a new name to create) ────────

    public function resolveCategoryId(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }

        return ItemCategory::firstOrCreate(['category_name' => trim((string) $value)])->id;
    }

    /**
     * An option comes as an id, a plain new name, or "new:Name" (explicit, so a size called "32" is
     * not mistaken for the id 32). Names that do not exist yet are created.
     *
     * @return list<int>
     */
    public function resolveOptionIds(array $values, string $modelClass, string $nameColumn = 'name'): array
    {
        return collect($values)
            ->filter(fn ($v) => $v !== null && $v !== '')
            ->map(function ($v) use ($modelClass, $nameColumn): int {
                [$id, $name] = $this->splitOption($v);

                return $id ?? (int) $modelClass::firstOrCreate([$nameColumn => $name])->id;
            })
            ->unique()->values()->all();
    }

    /** @return array{0: ?int, 1: string} [id, name]: one of them is set */
    private function splitOption(mixed $value): array
    {
        $text = trim((string) $value);

        if (str_starts_with($text, 'new:')) {
            return [null, trim(substr($text, 4))];
        }

        return is_numeric($text) ? [(int) $text, ''] : [null, $text];
    }

    /**
     * Like resolveOptionIds, but creates nothing: a name that does not exist yet becomes a negative
     * placeholder id, so a preview can count the variants it would add.
     *
     * @return list<int>
     */
    public function lookupOptionIds(array $values, string $modelClass, string $nameColumn = 'name'): array
    {
        $placeholder = 0;

        return collect($values)
            ->filter(fn ($v) => $v !== null && $v !== '')
            ->map(function ($v) use ($modelClass, $nameColumn, &$placeholder): int {
                [$id, $name] = $this->splitOption($v);
                if ($id !== null) {
                    return $id;
                }
                $found = $modelClass::query()->where($nameColumn, $name)->value('id');

                return $found !== null ? (int) $found : --$placeholder;
            })
            ->unique()->values()->all();
    }

    /** @return array<int, array{quantity: int}> packaging type id => pivot */
    public function resolvePackagingPayload(array $packaging): array
    {
        return collect($packaging)
            ->filter(fn ($row) => filled($row['item_packaging_type_id'] ?? null))
            ->mapWithKeys(function ($row): array {
                [$id, $name] = $this->splitOption($row['item_packaging_type_id']);
                $typeId = $id ?? ItemPackagingType::firstOrCreate(['name' => $name])->id;

                return [(int) $typeId => ['quantity' => max(1, (int) ($row['quantity'] ?? 1))]];
            })
            ->all();
    }

    // ── pictures ────────────────────────────────────────────────────────────

    /** The kept pictures plus the newly uploaded ones, as storage keys. @return list<string> */
    public function generalImages(Request $request, array $existingImages = []): array
    {
        $newPaths = [];

        foreach ($request->file('general_images', []) as $file) {
            if ($file && $file->isValid()) {
                $name = Str::slug((string) $request->input('product_name')).'_'.time().'_'.Str::random(5).'.'.$file->getClientOriginalExtension();
                $newPaths[] = $file->storeAs('uploads/items', $name, 'r2');
            }
        }

        return array_values(array_merge($existingImages, $newPaths));
    }

    /**
     * Variant pictures from the multi-dimensional form input
     * (variant_images[colour:size:packaging][slot], variant_existing_images[...]).
     */
    public function persistVariantImages(Request $request, Item $item): void
    {
        $item->load('variants');

        $newFiles = $request->file('variant_images', []);
        $existingPaths = $request->input('variant_existing_images', []);
        $submittedSlotKeys = array_keys($request->input('variant_slot_keys', []));

        foreach ($item->variants as $variant) {
            $fileKey = "variant_image_{$variant->id}";
            if ($request->hasFile($fileKey)) {
                $file = $request->file($fileKey);
                $fileName = "{$variant->sku}_main.".$file->getClientOriginalExtension();
                $path = $file->storeAs("uploads/variants/{$variant->sku}", $fileName, 'r2');
                $variant->update(['images' => [$path]]);

                continue;
            }

            $slots = array_fill(0, self::VARIANT_SLOTS, null);
            $variantKey = implode(':', [
                $variant->item_color_id ?? 'null',
                $variant->item_size_id ?? 'null',
                $variant->item_packaging_type_id ?? 'null',
            ]);

            if (! in_array($variantKey, $submittedSlotKeys, true)) {
                continue;
            }

            foreach ($existingPaths[$variantKey] ?? [] as $slotIndex => $path) {
                if (is_string($path) && $path !== '') {
                    $slots[(int) $slotIndex] = ltrim($path, '/');
                }
            }

            foreach ($newFiles[$variantKey] ?? [] as $slotIndex => $file) {
                if ($file && $file->isValid()) {
                    $slots[(int) $slotIndex] = $this->storeVariantFile($variant, (int) $slotIndex, $file);
                }
            }

            $variant->update(['images' => $slots]);
        }
    }

    /** Put one picture in one of a variant's five slots. */
    public function setVariantImage(ItemVariant $variant, int $slot, UploadedFile $file): void
    {
        $slots = $this->slotsOf($variant);
        $slots[$slot] = $this->storeVariantFile($variant, $slot, $file);
        $variant->update(['images' => $slots]);
    }

    public function removeVariantImage(ItemVariant $variant, int $slot): void
    {
        $slots = $this->slotsOf($variant);
        $slots[$slot] = null;
        $variant->update(['images' => $slots]);
    }

    /** @return list<string|null> */
    private function slotsOf(ItemVariant $variant): array
    {
        $images = is_array($variant->images) ? $variant->images : (json_decode((string) $variant->images, true) ?: []);
        $slots = array_fill(0, self::VARIANT_SLOTS, null);
        foreach ($images as $i => $path) {
            if ($i < self::VARIANT_SLOTS && is_string($path) && $path !== '') {
                $slots[(int) $i] = $path;
            }
        }

        return $slots;
    }

    private function storeVariantFile(ItemVariant $variant, int $slot, UploadedFile $file): string
    {
        $sku = $variant->sku ?? ('variant_'.$variant->id);
        $ext = $file->getClientOriginalExtension() ?: 'jpg';

        return $file->storeAs('uploads/variants/'.$sku, "{$sku}_".($slot + 1).".{$ext}", 'r2');
    }

    /** Add one picture to the item's general pictures (at most MAX_GENERAL_IMAGES). */
    public function addGeneralImage(Item $item, UploadedFile $file): void
    {
        $images = array_values($item->general_images ?? []);
        if (count($images) >= self::MAX_GENERAL_IMAGES) {
            throw ValidationException::withMessages(['image' => 'An item can have at most '.self::MAX_GENERAL_IMAGES.' pictures.']);
        }

        $name = Str::slug((string) $item->product_name).'_'.time().'_'.Str::random(5).'.'.($file->getClientOriginalExtension() ?: 'jpg');
        $images[] = $file->storeAs('uploads/items', $name, 'r2');
        $item->update(['general_images' => $images]);
    }

    public function removeGeneralImage(Item $item, string $path): void
    {
        $item->update(['general_images' => array_values(array_filter($item->general_images ?? [], fn ($p): bool => $p !== $path))]);
    }

    /** Every category with its full path ("Writing Tools > Pencil"), for pickers. @return list<array{id: int, path: string}> */
    public function categoryOptions(): array
    {
        $all = ItemCategory::query()->get(['id', 'category_name', 'parent_id'])->keyBy('id');
        $path = function (int $id) use ($all): string {
            $names = [];
            for ($guard = 0; $id && isset($all[$id]) && $guard < 10; $guard++) {
                array_unshift($names, (string) $all[$id]->category_name);
                $id = (int) ($all[$id]->parent_id ?? 0);
            }

            return implode(' > ', $names);
        };

        return $all->map(fn ($c): array => ['id' => (int) $c->id, 'path' => $path((int) $c->id)])->sortBy('path', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
    }

    // ── the item ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $data name, description, packaging details, category (id or new name), status */
    public function create(array $data, Request $request): Item
    {
        return $this->createFromData($data, $this->generalImages($request, []));
    }

    /**
     * The same item as create(), without a request: for callers that have no uploads (the CSV import).
     *
     * @param  array<string, mixed>  $data
     * @param  list<string>  $generalImages  storage keys
     */
    public function createFromData(array $data, array $generalImages = []): Item
    {
        return Item::create([
            'product_name' => $data['product_name'],
            'product_description' => $data['product_description'] ?? null,
            'packaging_details' => $data['packaging_details'] ?? null,
            'hs_code' => \App\Models\Procurement\Tariff::normalise($data['hs_code'] ?? null),
            'item_category_id' => $this->resolveCategoryId($data['item_category_id']),
            // evaluateDraftStatus() writes the status asked for once variants exist.
            'status' => 'draft',
            'general_images' => $generalImages,
            'is_incomplete' => true,
        ]);
    }

    /**
     * Change an item's own details (not its status, pictures or options).
     *
     * @param  array<string, mixed>  $data  product_name, product_description, packaging_details, hs_code, item_category_id (id or new name)
     */
    public function updateBasics(Item $item, array $data): void
    {
        $item->update([
            'product_name' => $data['product_name'],
            'product_description' => $data['product_description'] ?? null,
            'packaging_details' => $data['packaging_details'] ?? null,
            'hs_code' => \App\Models\Procurement\Tariff::normalise($data['hs_code'] ?? null),
            'item_category_id' => $this->resolveCategoryId($data['item_category_id']),
        ]);
    }

    /**
     * Apply the status the admin asked for, and record whether imagery is thin. Imagery is advisory:
     * it never hides an item (see the comment history in ItemController).
     */
    public function evaluateDraftStatus(Item $item, string $requestedStatus): void
    {
        $item->refresh()->load('variants.itemPackagingType');

        $allProven = $item->variants->every(fn (ItemVariant $variant): bool => $variant->hasImageProof());

        $item->update(['status' => $requestedStatus, 'is_incomplete' => ! $allProven]);
    }

    // ── colours, sizes, packaging and the variants they make ───────────────────

    /**
     * What applying these options would do to the item's variants, without doing it.
     *
     * @param  list<int|null>  $colorIds
     * @param  list<int|null>  $sizeIds
     * @param  list<int|null>  $packagingIds
     * @return array{add: int, restore: int, keep: int, remove: int, removing: list<string>}
     */
    public function previewVariants(Item $item, array $colorIds, array $sizeIds, array $packagingIds): array
    {
        $target = $this->combinations($colorIds, $sizeIds, $packagingIds);
        $live = ItemVariant::query()->where('item_id', $item->id)->get()->keyBy(fn (ItemVariant $v): string => $this->keyOf($v->item_color_id, $v->item_size_id, $v->item_packaging_type_id));
        $trashed = ItemVariant::onlyTrashed()->where('item_id', $item->id)->get()->keyBy(fn (ItemVariant $v): string => $this->keyOf($v->item_color_id, $v->item_size_id, $v->item_packaging_type_id));

        $add = $restore = $keep = 0;
        foreach (array_keys($target) as $key) {
            if ($live->has($key)) {
                $keep++;
            } elseif ($trashed->has($key)) {
                $restore++;
            } else {
                $add++;
            }
        }

        $removing = $live->reject(fn ($v, string $key): bool => isset($target[$key]));

        return [
            'add' => $add,
            'restore' => $restore,
            'keep' => $keep,
            'remove' => $removing->count(),
            'removing' => $removing->map(fn (ItemVariant $v): string => (string) $v->sku)->values()->all(),
        ];
    }

    /**
     * Set the item's colours, sizes and packaging (with pieces per pack) and generate the variants.
     * Variants that fall out of the matrix are removed and their store variants switched off.
     *
     * @param  list<int>  $colorIds
     * @param  list<int>  $sizeIds
     * @param  array<int, array{quantity: int}>  $packaging  type id => pivot
     */
    public function syncOptions(Item $item, array $colorIds, array $sizeIds, array $packaging): void
    {
        DB::transaction(function () use ($item, $colorIds, $sizeIds, $packaging): void {
            $item->colors()->sync($colorIds);
            $item->sizes()->sync($sizeIds);
            $item->packagingTypes()->sync($packaging);

            $before = ItemVariant::query()->where('item_id', $item->id)->pluck('id')->all();
            $this->generator->sync($item);
            $gone = array_diff($before, ItemVariant::query()->where('item_id', $item->id)->pluck('id')->all());

            if ($gone !== []) {
                StoreVariant::query()->whereIn('item_variant_id', $gone)->update(['active' => false]);
            }
        });
    }

    /** @return array<string, array{0: ?int, 1: ?int, 2: ?int}> */
    private function combinations(array $colorIds, array $sizeIds, array $packagingIds): array
    {
        $out = [];
        foreach ($colorIds === [] ? [null] : $colorIds as $c) {
            foreach ($sizeIds === [] ? [null] : $sizeIds as $s) {
                foreach ($packagingIds === [] ? [null] : $packagingIds as $p) {
                    $out[$this->keyOf($c, $s, $p)] = [$c, $s, $p];
                }
            }
        }

        return $out;
    }

    private function keyOf(mixed $color, mixed $size, mixed $packaging): string
    {
        return ($color ?? 'null').':'.($size ?? 'null').':'.($packaging ?? 'null');
    }

    // ── barcodes ────────────────────────────────────────────────────────────

    /**
     * Save barcodes (variant id => code; blank clears it). A code is 4–32 letters, digits, dots or
     * dashes and belongs to one live variant only.
     *
     * @param  array<int|string, mixed>  $codes
     *
     * @throws ValidationException
     */
    public function saveBarcodes(Item $item, array $codes): void
    {
        [$clean, $errors] = $this->checkBarcodes($item, $codes);

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        DB::transaction(function () use ($clean): void {
            foreach ($clean as $variantId => $code) {
                ItemVariant::query()->whereKey($variantId)->update(['barcode' => $code]);
            }
        });
    }

    /**
     * What saveBarcodes would refuse, without saving anything (the CSV import checks a file with it).
     *
     * @param  array<int|string, mixed>  $codes  variant id => code
     * @return array<string, string> "barcodes.{variant id}" => message
     */
    public function barcodeErrors(Item $item, array $codes): array
    {
        return $this->checkBarcodes($item, $codes)[1];
    }

    /**
     * @param  array<int|string, mixed>  $codes
     * @return array{0: array<int, ?string>, 1: array<string, string>} [variant id => code to save, errors]
     */
    private function checkBarcodes(Item $item, array $codes): array
    {
        $variants = ItemVariant::query()->where('item_id', $item->id)->get()->keyBy('id');
        $errors = [];
        $clean = [];

        foreach ($codes as $variantId => $code) {
            $variant = $variants->get((int) $variantId);
            if ($variant === null) {
                $errors["barcodes.{$variantId}"] = 'That variant does not belong to this item.';

                continue;
            }

            $code = trim((string) $code);
            if ($code === '') {
                $clean[(int) $variantId] = null;

                continue;
            }
            if (! preg_match('/^[A-Za-z0-9.\-]{4,32}$/', $code)) {
                $errors["barcodes.{$variantId}"] = 'Use 4 to 32 letters, digits, dots or dashes.';

                continue;
            }
            if (in_array($code, array_filter($clean, fn ($c) => $c !== null), true)) {
                $errors["barcodes.{$variantId}"] = "{$code} is on two variants of this item.";

                continue;
            }
            if (ItemVariant::query()->where('barcode', $code)->where('id', '!=', $variantId)->exists()) {
                $errors["barcodes.{$variantId}"] = "{$code} is already used by another variant.";

                continue;
            }
            $clean[(int) $variantId] = $code;
        }

        return [$clean, $errors];
    }

    /**
     * A shop's own code for a variant with none printed: EAN-13, the "2" prefix reserved for in-store
     * use, then the variant's id, then the check digit. The same variant always gets the same code.
     */
    public function generateBarcode(ItemVariant $variant): string
    {
        $attempt = 0;
        do {
            $body = '2'.str_pad((string) ($variant->id + $attempt * 1_000_000_000), 11, '0', STR_PAD_LEFT);
            $code = $body.$this->checkDigit($body);
            $attempt++;
        } while (ItemVariant::query()->where('barcode', $code)->where('id', '!=', $variant->id)->exists() && $attempt < 10);

        $variant->update(['barcode' => $code]);

        return $code;
    }

    /** EAN-13 check digit of the first twelve digits. */
    public function checkDigit(string $twelve): int
    {
        $sum = 0;
        foreach (str_split($twelve) as $i => $digit) {
            $sum += (int) $digit * ($i % 2 === 0 ? 1 : 3);
        }

        return (10 - $sum % 10) % 10;
    }
}
