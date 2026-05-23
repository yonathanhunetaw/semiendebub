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
     * Returns array of ['path' => <key>, 'url' => <full url>].
     */
    public function getImageSlotsAttribute(): array
    {
        if (empty($this->images)) {
            return [];
        }

        return collect($this->images)
            ->filter()
            ->map(fn($key) => [
                'path' => $key,
                'url' => ImageResolver::resolve($key),
            ])
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
    | Business Logic
    |--------------------------------------------------------------------------
    */

    public function totalStock(): int
    {
        return $this->stocks()->sum('quantity');
    }

    public function stockAtLocation(string $locationType, int $locationId): int
    {
        return $this->stocks()
            ->where('location_type', $locationType)
            ->where('location_id', $locationId)
            ->sum('quantity');
    }

    public function packagingQuantities()
    {
        return $this->belongsToMany(ItemPackagingType::class, 'item_variant_packaging_quantity')
            ->withPivot('quantity', 'cbm') // Only these two!
            ->withTimestamps();
    }
}