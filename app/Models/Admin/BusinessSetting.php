<?php

declare(strict_types=1);

namespace App\Models\Admin;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The business rules a global admin changes in Settings (one row); see App\Services\Admin\BusinessRules. */
class BusinessSetting extends Model
{
    protected $fillable = [
        'unpaid_reservation_minutes', 'cash_flag_days', 'archive_after_days',
        'same_day_promise', 'delayed_promise',
        'auto_replenishment', 'replenish_on_stock_change', 'shelf_refill_on_stock_change',
        'storefront_low_stock_threshold', 'storefront_per_page', 'storefront_max_line_quantity',
        'updated_by',
    ];

    protected $casts = [
        'unpaid_reservation_minutes' => 'integer',
        'cash_flag_days' => 'integer',
        'archive_after_days' => 'integer',
        'auto_replenishment' => 'boolean',
        'replenish_on_stock_change' => 'boolean',
        'shelf_refill_on_stock_change' => 'boolean',
        'storefront_low_stock_threshold' => 'integer',
        'storefront_per_page' => 'integer',
        'storefront_max_line_quantity' => 'integer',
    ];

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
