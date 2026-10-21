<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A task for one store's sellers: find what this idea (or item) sells for at
 * other shops. Changes go through App\Services\Procurement\PriceCheckService.
 */
class PriceCheck extends Model
{
    use HasFactory;

    public const OPEN = 'open';

    public const CLOSED = 'closed';

    protected $fillable = [
        'store_id',
        'product_idea_id',
        'item_id',
        'shops_wanted',
        'due_on',
        'note',
        'status',
        'created_by',
        'closed_by',
        'closed_at',
    ];

    protected $casts = [
        'shops_wanted' => 'integer',
        'due_on' => 'date',
        'closed_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function idea(): BelongsTo
    {
        return $this->belongsTo(ProductIdea::class, 'product_idea_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The sellers named on it; none = any seller of the store. */
    public function assignees(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'price_check_users');
    }

    public function observations(): HasMany
    {
        return $this->hasMany(PriceObservation::class);
    }

    /** What is being checked: the idea's name or the item's. */
    public function subject(): string
    {
        return (string) ($this->idea?->name ?? $this->item?->product_name ?? 'Unknown product');
    }
}
