<?php

namespace App\Models\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;


class Cart extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'user_id',
        'seller_id',
        'customer_id',
        'session_id',
        'status',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function seller(): BelongsTo
    {
        // Point explicitly to the Auth folder model
        return $this->belongsTo(User::class, 'seller_id')
            ->where('role', 'seller')
            ->withDefault([
                'first_name' => 'Deleted',
                'last_name' => 'User'
            ]);
    }

    /**
     * The primary relationship for cart contents.
     * Links to specific SKUs/Variants.
     */
    public function variants(): BelongsToMany
    {
        return $this->belongsToMany(ItemVariant::class, 'cart_items', 'cart_id', 'item_variant_id')
            ->using(CartItem::class)
            ->withPivot('quantity', 'price', 'store_id')
            ->withTimestamps();
    }

    /*
    |--------------------------------------------------------------------------
    | Accessors & Scopes
    |--------------------------------------------------------------------------
    */

    public function getNameAttribute(): string
    {
        return $this->customer ? $this->customer->name . "'s Cart" : 'Cart ' . $this->id;
    }

    // Scopes for easy filtering in your Admin Dashboard
    public function scopeForStore($query, $storeId)
    {
        return $query->where('store_id', $storeId);
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    public function assignToSeller(User $seller)
    {
        // Safety check to ensure multi-tenancy integrity
        if ($seller->store_id !== $this->store_id) {
            throw new \InvalidArgumentException("This seller does not belong to the cart's store.");
        }

        $this->update(['seller_id' => $seller->id]);
    }
}
