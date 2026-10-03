<?php

namespace App\Models\Item;

use App\Models\Auth\User;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\ImageResolver;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ItemVariant extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'item_variants';

    protected $fillable = [
        'item_id',
        'item_color_id',
        'item_size_id',
        'owner_id',
        'item_packaging_type_id',
        'barcode',
        'images',  // Stores raw MinIO keys, e.g. ["uploads/variants/SKU/front.jpg"]
        'status',
        'sku',
    ];

    protected $casts = [
        'images' => 'array',
    ];

    protected static function booted()
    {
        static::created(function ($variant) {
            if (!$variant->sku) {
                $itemSku = $variant->item?->sku ?? 'ITEM';
                $colorCode = $variant->itemColor?->code ?? 'X';
                $sizeCode = $variant->itemSize?->code ?? 'X';

                // SKU format simplified to physical combination tracking matrix
                $variant->sku = "{$itemSku}-{$colorCode}-{$sizeCode}-{$variant->id}";
                $variant->saveQuietly();
            }
        });
    }

    protected static function newFactory()
    {
        return \Database\Factories\ItemVariantFactory::new();
    }

    /*
    |--------------------------------------------------------------------------
    | Image Accessors
    |--------------------------------------------------------------------------
    */

    /**
     * Single representative image URL.
     * Usage: $variant->image_url
     */
    public function getImageUrlAttribute(): string
    {
        $key = $this->images[0] ?? null;
        return ImageResolver::resolve($key);
    }

    /**
     * All images as fully-resolved URLs.
     * Usage: $variant->all_image_urls
     */
    public function getAllImageUrlsAttribute(): array
    {
        if (empty($this->images)) {
            return [asset('images/defaults/no-image.png')];
        }
        return ImageResolver::resolveAll($this->images);
    }

    /**
     * Structured slot data for the Show.tsx admin view.
     * Returns fixed-position slots of ['path' => <key>, 'url' => <full url>]
     * or null for an empty slot.
     */
    public function getImageSlotsAttribute(): array
    {
        if (empty($this->images)) {
            return [];
        }

        return collect($this->images)
            ->map(fn($key) => $key ? [
                'path' => $key,
                'url' => ImageResolver::resolve($key),
            ] : null)
            ->values()
            ->toArray();
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function itemColor()
    {
        return $this->belongsTo(ItemColor::class, 'item_color_id');
    }

    public function itemSize()
    {
        return $this->belongsTo(ItemSize::class, 'item_size_id');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function storeVariants()
    {
        return $this->hasMany(StoreVariant::class, 'item_variant_id');
    }

    public function stocks()
    {
        return $this->hasMany(\App\Models\StockKeeper\ItemStock::class, 'item_variant_id');
    }

    public function stores()
    {
        return $this->belongsToMany(Store::class, 'store_variants', 'item_variant_id', 'store_id')
            ->withPivot('price', 'discount_price', 'active', 'discount_ends_at')
            ->withTimestamps();
    }

    public function storeCustomerPrices()
    {
        return $this->hasMany(StoreVariantCustomerPrice::class, 'store_variant_id');
    }

    public function storeSellerPrices()
    {
        return $this->hasMany(StoreVariantSellerPrice::class, 'store_variant_id');
    }

    public function item_stock()
    {
        return $this->hasOne(ItemStock::class, 'item_variant_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Image proof
    |--------------------------------------------------------------------------
    */

    /**
     * Packaging tier key, or null when the packaging cannot be classified.
     *
     * The PHP twin of classifyPackagingTier() in
     * resources/js/Components/Seller/itemShowHelpers.ts — the two decide the
     * same thing on either side of the wire and must be changed together.
     * Both spellings of carton are matched because the catalogue was seeded
     * as "Cartoon".
     */
    public function packagingTier(): ?string
    {
        $value = strtolower((string) $this->itemPackagingType?->name);

        if ($value === '') {
            return null;
        }

        return match (true) {
            str_contains($value, 'carton'), str_contains($value, 'cartoon') => 'cartoon',
            str_contains($value, 'box') => 'box',
            str_contains($value, 'bundle') => 'bundle',
            str_contains($value, 'bag'), str_contains($value, 'sack') => 'bag',
            // Before 'pack', so "packet" cannot swallow it.
            str_contains($value, 'dozen'), str_contains($value, 'doz'), str_contains($value, 'dz') => 'doz',
            str_contains($value, 'packet'), str_contains($value, 'pack') => 'packet',
            str_contains($value, 'piece'), str_contains($value, 'pcs'), str_contains($value, 'pc') => 'piece',
            default => null,
        };
    }

    /** Image keys that are actually set, with blanks and nulls discarded. */
    public function realImageKeys(): array
    {
        $images = is_array($this->images) ? $this->images : [];

        return array_values(array_filter(
            $images,
            static fn ($key): bool => is_string($key) && trim($key) !== '',
        ));
    }

    /**
     * Whether this variant may be published.
     *
     * Two photographs is the bar, but a variant whose packaging resolves to a
     * tier also passes: the UI draws a PackagingPlaceholder for it, so it has
     * something truthful to show rather than a broken image.
     *
     * This replaces three separate counts in Admin\ItemController that had
     * drifted apart — one used bare count(), so a literal null inside the
     * array satisfied it, while another used array_filter() and did not.
     */
    public function hasImageProof(): bool
    {
        return count($this->realImageKeys()) >= 2 || $this->packagingTier() !== null;
    }

    /** True only when real photographs exist — drives the advisory admin hint. */
    public function hasPhotographicProof(): bool
    {
        return count($this->realImageKeys()) >= 2;
    }

    /*
    |--------------------------------------------------------------------------
    | Business Logic
    |--------------------------------------------------------------------------
    */

    public function totalStock(): int
    {
        return $this->stocks()->sum('quantity');
    }

    public function stockAtLocation(string $locationType, int $locationId): int
    {
        return (int) $this->stocks()
            ->whereIn('stock_location_id', app(\App\Services\Inventory\StockScope::class)->leafIds($locationType, $locationId))
            ->sum('quantity');
    }

    public function packagingQuantities()
    {
        return $this->belongsToMany(ItemPackagingType::class, 'item_variant_packaging_quantity')
            ->withPivot('quantity', 'cbm') // Only these two!
            ->withTimestamps();
    }

    public function itemPackagingType()
    {
        return $this->belongsTo(ItemPackagingType::class, 'item_packaging_type_id');
    }

    /**
     * Calculates total pieces based on the packaging relationship.
     */
    public function calculateTotalPieces(): int
    {
        if ($this->item_packaging_type_id) {
            $pivotRow = $this->packagingQuantities()
                ->where('item_packaging_types.id', $this->item_packaging_type_id)
                ->first();

            if ($pivotRow && isset($pivotRow->pivot->quantity)) {
                return (int) $pivotRow->pivot->quantity;
            }
        }

        return (int) $this->packagingQuantities()
            ->sum('item_variant_packaging_quantity.quantity');
    }
}
