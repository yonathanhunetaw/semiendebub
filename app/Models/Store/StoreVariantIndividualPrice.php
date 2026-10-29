<?php

namespace App\Models\Store;

use App\Models\Store\Concerns\RecordsPriceChanges;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class StoreVariantIndividualPrice extends Model
{
    use RecordsPriceChanges;

    /** For the price history (price_changes.kind). */
    public const PRICE_KIND = PriceChange::KIND_INDIVIDUAL;

    use HasFactory;

    protected $table = 'store_variants_individual_prices';

    protected $fillable = [
        'store_variant_id',
        'pricing_matrix',
        'active',
    ];

    protected $casts = [
        'pricing_matrix' => 'array',
        'active' => 'boolean',
    ];

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }
}
