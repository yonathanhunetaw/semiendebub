<?php

namespace App\Models\Item;

use App\Models\Auth\User;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantSellerPrice;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Database\Factories\ItemVariantFactory;

class ItemVariant extends Model
{
    use HasFactory;
    use SoftDeletes;


    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'item_variants'; // Explicitly set the table name

    /**
     * The attributes that are mass assignable.
     *
     * @var array
     */
    protected $fillable = [
        'item_id',
        'item_color_id',
        'item_size_id',
        'item_packaging_type_id',
        'owner_id',
        'barcode',
        'images',
        'status',
        'packaging_total_pieces',
        'sku',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array
     */
    protected $casts = [
        'images' => 'array', // so JSON becomes array automatically
    ];

    protected static function booted()
    {

        static::created(function ($variant) {
            if (!$variant->sku) {
                $itemSku = $variant->item?->sku ?? 'ITEM';
                $colorCode = $variant->item_color?->code ?? 'X';
                $sizeCode = $variant->item_size?->code ?? 'X';
                $packCode = $variant->item_packaging_type?->code ?? '1';

                $variant->sku = "{$itemSku}-{$colorCode}-{$sizeCode}-{$packCode}-{$variant->id}";
                $variant->saveQuietly(); // safe, id exists, guaranteed unique
            }
        });

    }

    protected static function newFactory()
    {
        return \Database\Factories\ItemVariantFactory::new();
    }

    /**
     * Get the item that owns the variant.
     */
    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /**
     * Get the color associated with the variant.
     */
    public function color(): BelongsTo
    {
        return $this->belongsTo(ItemColor::class, 'item_color_id');
    }

    /**
     * Get the size associated with the variant.
     */
    public function size(): BelongsTo
    {
        return $this->belongsTo(ItemSize::class, 'item_size_id');
    }

    /**
     * Get the packaging type associated with the variant.
     */
    public function itemPackagingType(): BelongsTo
    {
        return $this->belongsTo(ItemPackagingType::class, 'item_packaging_type_id');
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

    /**
     * Get all physical variants (SKUs) associated with this item template.
     * This is your link to the actual prices and stock.
     */
    public function variants()
    {
        // Ensure this matches the 'item_id' in your item_variants migration
        return $this->hasMany(ItemVariant::class, 'item_id');
    }

    public function stocks()
    {
        return $this->hasMany(\App\Models\StockKeeper\ItemStock::class, 'item_variant_id');
    }

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
    // Customer-specific prices
    // public function customerPrices(): HasMany
    // {
    //     return $this->hasMany(CustomerPrice::class, 'item_variant_id');
    //     // 'item_variant_id' is the foreign key in the customer_prices table pointing to this variant
    // }

    // // Seller-specific prices
    // public function sellerPrices(): HasMany
    // {
    //     return $this->hasMany(SellerPrice::class, 'item_variant_id');
    //     // 'item_variant_id' is the foreign key in the seller_prices table pointing to this variant
    // }

    // In ItemVariant.php

    // Store-specific customer prices

    public function stores()
    {
        return $this->belongsToMany(Store::class, 'store_variants', 'item_variant_id', 'store_id')
            ->withPivot('price', 'discount_price', 'active', 'discount_ends_at')
            ->withTimestamps();
    }

    // Store-specific seller prices

    public function storeCustomerPrices()
    {
        return $this->hasMany(StoreVariantCustomerPrice::class, 'store_variant_id');
    }

    public function storeSellerPrices()
    {
        return $this->hasMany(StoreVariantSellerPrice::class, 'store_variant_id');
    }

    public function calculateTotalPieces(): int
    {
        if (!$this->item_packaging_type_id) {
            return 1;
        }

        $item = $this->item;
        $packs = $item->packagingTypes->sortBy('pivot_id')->values();
        $total = 1;
        $found = false;

        foreach ($packs as $pack) {
            $qty = $pack->pivot->quantity ?? 1;
            $total *= $qty;

            if ($pack->id == $this->item_packaging_type_id) {
                $found = true;
                break;
            }
        }

        return $found ? $total : 1;
    }

    public function item_stock()
    {
        return $this->hasOne(ItemStock::class, 'variant_id'); // or hasMany if multiple stocks
    }
}
