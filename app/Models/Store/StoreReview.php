<?php

declare(strict_types=1);

namespace App\Models\Store;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A shopper's rating of a store, written only through App\Services\Storefront\StoreReviews. */
class StoreReview extends Model
{
    protected $fillable = ['store_id', 'user_id', 'sale_id', 'rating', 'comment', 'hidden_at', 'hidden_by'];

    protected $casts = ['rating' => 'integer', 'hidden_at' => 'datetime'];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @param  Builder<StoreReview>  $query */
    public function scopeShown(Builder $query): Builder
    {
        return $query->whereNull('hidden_at');
    }
}
