<?php

declare(strict_types=1);

namespace App\Models\Store;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * One change to a store's price (Concerns\RecordsPriceChanges writes them).
 * Only ever added to, never edited.
 */
class PriceChange extends Model
{
    public const UPDATED_AT = null;

    public const KIND_STORE = 'store';

    public const KIND_SELLER = 'seller';

    public const KIND_CUSTOMER = 'customer';

    public const KIND_INDIVIDUAL = 'individual';

    protected $fillable = [
        'kind', 'priceable_type', 'priceable_id', 'store_variant_id', 'store_id',
        'old_matrix', 'new_matrix', 'old_price', 'new_price', 'changed_by',
    ];

    protected $casts = [
        'priceable_id' => 'integer',
        'store_variant_id' => 'integer',
        'store_id' => 'integer',
        'old_matrix' => 'array',
        'new_matrix' => 'array',
        'old_price' => 'decimal:2',
        'new_price' => 'decimal:2',
        'changed_by' => 'integer',
        'created_at' => 'datetime',
    ];

    public function priceable(): MorphTo
    {
        return $this->morphTo();
    }

    public function storeVariant(): BelongsTo
    {
        return $this->belongsTo(StoreVariant::class, 'store_variant_id');
    }

    public function changer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
