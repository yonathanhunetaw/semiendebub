<?php

namespace App\Models\Store;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use InvalidArgumentException;
use LogicException;

class StoreVariant extends Model
{
    public const MODES = ['auto', 'forced'];

    public const STATUSES = [
        'active',
        'inactive',
        'out_of_stock',
        'unavailable',
    ];

    protected $table = 'store_variants';

    protected $fillable = [
        'store_id',
        'item_variant_id',
        'price',
        'discount_price',
        'discount_ends_at',
        'stock',
        'manual_status',
        'forced_status',
        'active',
    ];

    /* ---------------------------------------------
     | Constants
     |---------------------------------------------*/
    protected $casts = [
        'active' => 'boolean',
        'discount_ends_at' => 'datetime',
        'stock' => 'integer',
    ];

    protected $appends = [
        'computed_status',
        'display_status',
    ];

    /* ---------------------------------------------
     | Relationships
     |---------------------------------------------*/

    protected static function booted()
    {
        static::saving(function ($model) {
            if (
                $model->manual_status === 'forced'
                && empty($model->forced_status)
            ) {
                throw new LogicException(
                    'forced_status is required when manual_status is forced'
                );
            }
        });
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function stocks()
    {
        return $this->hasMany(ItemStock::class, 'store_variant_id');
    }

    public function customerPrices()
    {
        return $this->hasMany(StoreVariantCustomerPrice::class);
    }

    public function sellerPrices()
    {
        return $this->hasMany(StoreVariantSellerPrice::class, 'store_variant_id');
    }

    /* ---------------------------------------------
     | Mutators (Validation logic)
     |---------------------------------------------*/

    public function customers()
    {
        return $this->belongsToMany(
            Customer::class,
            'store_customers',
            'store_id',
            'customer_id'
        );
    }

    public function setManualStatusAttribute($value): void
    {
        if (! in_array($value, self::MODES, true)) {
            throw new InvalidArgumentException('Invalid manual_status');
        }

        $this->attributes['manual_status'] = $value;

        // Reset forced status when switching back to auto
        if ($value === 'auto') {
            $this->attributes['forced_status'] = null;
        }
    }

    /* ---------------------------------------------
     | Computed Attributes
     |---------------------------------------------*/

    public function setForcedStatusAttribute($value): void
    {
        if ($value === null) {
            $this->attributes['forced_status'] = null;

            return;
        }

        if (
            ($this->manual_status ?? 'auto') === 'forced'
            && ! in_array($value, self::STATUSES, true)
        ) {
            throw new InvalidArgumentException('Invalid forced_status');
        }

        $this->attributes['forced_status'] = $value;
    }

    public function getComputedStatusAttribute(): string
    {
        // Forced always wins
        if ($this->manual_status === 'forced') {
            return $this->forced_status ?? 'inactive';
        }

        // Auto logic
        if (($this->stock ?? 0) <= 0) {
            return 'out_of_stock';
        }

        if (
            $this->discount_ends_at &&
            now()->greaterThan($this->discount_ends_at)
        ) {
            return 'inactive';
        }

        return 'active';
    }

    /* ---------------------------------------------
     | Scopes
     |---------------------------------------------*/

    public function getDisplayStatusAttribute(): string
    {
        return strtoupper(
            $this->manual_status.' – '.str_replace('_', ' ', $this->computed_status)
        );
    }

    public function scopeAuto($query)
    {
        return $query->where('manual_status', 'auto');
    }

    public function scopeForced($query)
    {
        return $query->where('manual_status', 'forced');
    }

    /* ---------------------------------------------
     | Model Guards (replaces DB CHECK constraints)
     |---------------------------------------------*/

    public function scopeComputedActive($query)
    {
        return $query->where(function ($q) {
            $q->where('manual_status', 'forced')
                ->where('forced_status', 'active')
                ->orWhere(function ($q) {
                    $q->where('manual_status', 'auto')
                        ->where('stock', '>', 0)
                        ->where(function ($q) {
                            $q->whereNull('discount_ends_at')
                                ->orWhere('discount_ends_at', '>', now());
                        });
                });
        });
    }
}
