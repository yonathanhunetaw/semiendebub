<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A stock keeper assigned to a location. Any number per location; staff of a
 * store node are staff of its shelf, floor and Remote Hub too.
 *
 * @property int $stock_location_id
 * @property int $user_id
 */
class LocationStaff extends Model
{
    protected $table = 'location_staff';

    protected $fillable = [
        'stock_location_id',
        'user_id',
        'assigned_by',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'user_id' => 'integer',
    ];

    public function location(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
