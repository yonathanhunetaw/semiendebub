<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-site settings: the counter QR's secret (never sent to a browser), the
 * grace before an opening counts as missed, and the two checklists.
 */
class SiteSetting extends Model
{
    public const DEFAULT_OPENING = ['Door, lights and power on', 'Shelves and floor tidy', 'Cash float counted'];

    public const DEFAULT_CLOSING = ['Till counted', 'Nobody left inside', 'Lights off, door locked'];

    protected $fillable = ['stock_location_id', 'qr_secret', 'qr_version', 'open_grace_minutes', 'opening_checklist', 'closing_checklist'];

    protected $hidden = ['qr_secret'];

    protected $casts = [
        'stock_location_id' => 'integer',
        'qr_version' => 'integer',
        'open_grace_minutes' => 'integer',
        'opening_checklist' => 'array',
        'closing_checklist' => 'array',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    /** @return array<int, string> */
    public function openingItems(): array
    {
        return $this->opening_checklist ?: self::DEFAULT_OPENING;
    }

    /** @return array<int, string> */
    public function closingItems(): array
    {
        return $this->closing_checklist ?: self::DEFAULT_CLOSING;
    }
}
