<?php

namespace App\Models\Item;

use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Services\ImageResolver;
use Database\Factories\Item\ItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Item extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_name',
        'product_description',
        'packaging_details',
        'general_images',  // Stores raw MinIO keys, e.g. ["uploads/items/1/cover.jpg"]
        'status',
        'item_category_id',
        'is_incomplete',
    ];

    protected $casts = [
        'general_images' => 'array',
        'is_incomplete'  => 'boolean',
    ];

    protected static function newFactory()
    {
        return ItemFactory::new();
    }

    /*
    |--------------------------------------------------------------------------
    | Image Accessors
    |--------------------------------------------------------------------------
    */

    /**
     * Returns general_images as fully-resolved browser URLs.
     * Falls back to the default image for any missing/broken key.
     *
     * Usage: $item->processed_images  (matches what Index.tsx expects)
     */
    public function getProcessedImagesAttribute(): array
    {
        return ImageResolver::resolveAll($this->general_images ?? []);
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function category(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'item_category_id');
    }

    public function colors(): BelongsToMany
    {
        return $this->belongsToMany(ItemColor::class, 'item_color_item', 'item_id', 'item_color_id')
            ->withTimestamps();
    }

    public function sizes(): BelongsToMany
    {
        return $this->belongsToMany(ItemSize::class, 'item_item_size', 'item_id', 'item_size_id')
            ->withTimestamps();
    }

    public function packagingTypes(): BelongsToMany
    {
        return $this->belongsToMany(ItemPackagingType::class, 'item_packaging_type_item', 'item_id', 'item_packaging_type_id')
            ->withPivot('quantity')
            ->withTimestamps();
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ItemVariant::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ItemImage::class);
    }

    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class)
            ->withPivot('active')
            ->withTimestamps();
    }

    /*
    |--------------------------------------------------------------------------
    | Business Logic
    |--------------------------------------------------------------------------
    */

    public function getPackagingDisplay(): array
    {
        $packs = $this->packagingTypes()->orderBy('item_packaging_type_id')->get();
        $result = [];
        $totals = [];

        foreach ($packs as $index => $pack) {
            $qty = $pack->pivot->quantity ?? 1;

            if ($index === 0) {
                $totals[$pack->name] = $qty;
                $result[] = "{$pack->name}: {$qty} pcs";
            } else {
                $prevPack = $packs[$index - 1];
                $totals[$pack->name] = $qty * $totals[$prevPack->name];
                $ancestorText = [];
                for ($i = $index - 1; $i >= 0; $i--) {
                    $childQty = $packs[$i + 1]->pivot->quantity ?? 1;
                    $ancestorText[] = "{$childQty} {$packs[$i]->name}";
                }
                $ancestorText = array_reverse($ancestorText);
                $display = "{$pack->name}: " . implode(', ', $ancestorText) . " ({$totals[$pack->name]} pcs)";
                $result[] = $display;
            }
        }

        return $result;
    }
}
