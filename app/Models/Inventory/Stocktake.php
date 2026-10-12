<?php

declare(strict_types=1);

namespace App\Models\Inventory;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A count of one location. See App\Services\Inventory\StocktakeService.
 *
 * counting → submitted → posted (adjustments booked), or voided.
 *
 * @property string $status
 */
class Stocktake extends Model
{
    public const COUNTING = 'counting';

    public const SUBMITTED = 'submitted';

    public const POSTED = 'posted';

    public const VOIDED = 'voided';

    protected $fillable = [
        'reference',
        'stock_location_id',
        'status',
        'note',
        'started_by',
        'submitted_by',
        'approved_by',
        'submitted_at',
        'posted_at',
        'voided_at',
    ];

    protected $casts = [
        'stock_location_id' => 'integer',
        'submitted_at' => 'datetime',
        'posted_at' => 'datetime',
        'voided_at' => 'datetime',
    ];

    public function location(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(StocktakeLine::class);
    }

    public function starter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'started_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
