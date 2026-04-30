<?php

namespace App\Models\Item;

use App\Models\Seller\Cart;
use App\Models\Store\Store;
use Database\Factories\Item\ItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Item extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     * Matches your 'items' migration exactly.
     */
    protected $fillable = [
        'product_name',
        'product_description',
        'packaging_details',
        'general_images',
        'status',
        'item_category_id',
        'is_incomplete',
    ];

    /**
     * Cast JSON columns to arrays automatically.
     */
    protected $casts = [
        'general_images' => 'array',
        'is_incomplete' => 'boolean',
    ];

    /**
     * Link to the new modular factory location.
     */
    protected static function newFactory()
    {
        return ItemFactory::new();
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    /**
     * Item belongs to a main category.
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ItemCategory::class, 'item_category_id');
    }

    /**
     * Many-to-many with colors.
     */
    public function colors(): BelongsToMany
    {
        return $this->belongsToMany(ItemColor::class, 'item_color_item', 'item_id', 'item_color_id')
                    ->withTimestamps();
    }

    /**
     * Many-to-many with sizes.
     */
    public function sizes(): BelongsToMany
    {
        return $this->belongsToMany(ItemSize::class, 'item_item_size', 'item_id', 'item_size_id')
                    ->withTimestamps();
    }

    /**
     * Many-to-many with packaging types (Piece, Box, Carton, etc.).
     * Includes the multiplier quantity in the pivot table.
     */
    public function packagingTypes(): BelongsToMany
    {
        return $this->belongsToMany(ItemPackagingType::class, 'item_packaging_type_item', 'item_id', 'item_packaging_type_id')
                    ->withPivot('quantity')
                    ->withTimestamps();
    }

    /**
     * Get all physical variants (SKUs) associated with this item template.
     */
    public function variants(): HasMany
    {
        return $this->hasMany(ItemVariant::class);
    }

    /**
     * Legacy/Optional: Relationship to images table if not using JSON general_images.
     */
    public function images(): HasMany
    {
        return $this->hasMany(ItemImage::class);
    }

    /**
     * Marketplace integration: Which stores carry this item template.
     */
    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class)
                    ->withPivot('active')
                    ->withTimestamps();
    }

    /*
    |--------------------------------------------------------------------------
    | Business Logic / Helpers
    |--------------------------------------------------------------------------
    */

    /**
     * Generates a display-friendly list of the packaging hierarchy.
     * Example: ["Piece: 1 pcs", "Box: 12 Piece (12 pcs)", "Carton: 20 Box (240 pcs)"]
     */
    public function getPackagingDisplay(): array
    {
        // Sort packages by ID to ensure smallest (Piece) to largest (Carton)
        $packs = $this->packagingTypes()->orderBy('item_packaging_type_id')->get();

        $result = [];
        $totals = [];

        foreach ($packs as $index => $pack) {
            $qty = $pack->pivot->quantity ?? 1;

            if ($index === 0) {
                // Base level (e.g., Piece)
                $totals[$pack->name] = $qty;
                $result[] = "{$pack->name}: {$qty} pcs";
            } else {
                // Higher levels (e.g., Box, Carton)
                $prevPack = $packs[$index - 1];
                $totals[$pack->name] = $qty * $totals[$prevPack->name];

                // Build text like "12 Piece"
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
