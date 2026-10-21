<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Another shop in the market, where sellers go to check prices. Each store
 * marks a shop "check" or "avoid" (store_shops); only "check" shops are offered.
 */
class Shop extends Model
{
    use HasFactory;

    public const CHECK = 'check';

    public const AVOID = 'avoid';

    protected $fillable = ['name', 'area', 'phone', 'notes', 'is_active', 'created_by'];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class, 'store_shops')->withPivot('mode')->withTimestamps();
    }
}
