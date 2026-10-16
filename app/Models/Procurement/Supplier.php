<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A shop procurement buys from, usually abroad. A record with no login:
 * the vendor role (`purchases.vendor_id`) is a separate thing.
 */
class Supplier extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'name',
        'country',
        'city',
        'currency',
        'phone',
        'email',
        'address',
        'contacts',
        'default_payment_terms',
        'default_payment_days',
        'notes',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'contacts' => 'array',
        'default_payment_days' => 'integer',
        'is_active' => 'boolean',
    ];

    public function purchases(): HasMany
    {
        return $this->hasMany(Purchase::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
