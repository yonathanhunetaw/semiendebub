<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * When a site opens and closes on one weekday (0 = Sunday, Carbon's dayOfWeek).
 * Times are wall-clock "H:i:s" in the app timezone.
 */
class SiteHour extends Model
{
    protected $fillable = ['stock_location_id', 'weekday', 'opens_at', 'closes_at', 'closed'];

    protected $casts = [
        'stock_location_id' => 'integer',
        'weekday' => 'integer',
        'closed' => 'boolean',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }
}
