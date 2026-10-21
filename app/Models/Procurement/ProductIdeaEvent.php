<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One step in a product idea's life: who moved it, from what, to what, and why. */
class ProductIdeaEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['product_idea_id', 'user_id', 'from_status', 'to_status', 'note'];

    public function idea(): BelongsTo
    {
        return $this->belongsTo(ProductIdea::class, 'product_idea_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
