<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One date a site keeps other hours, or stays closed (a holiday). */
class SiteHourException extends Model
{
    protected $fillable = ['stock_location_id', 'date', 'closed', 'opens_at', 'closes_at', 'note', 'created_by'];

    protected $casts = [
        'stock_location_id' => 'integer',
        'date' => 'date',
        'closed' => 'boolean',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }
}
