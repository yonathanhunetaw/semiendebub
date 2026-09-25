<?php

namespace App\Models\Fulfillment;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Delivery extends Model
{
    use HasFactory;

    protected $table = 'deliveries';

    protected $fillable = [
        'sale_id',
        'tracking_number',
        'status',
        'delivery_address',
        'recipient_name',
        'recipient_phone',
        'courier_name',
        'courier_id',
        'scheduled_for',
        'picked_up_at',
        'shipped_at',
        'delivered_at',
        'failed_at',
        'failure_reason',
        'proof_of_delivery',
        'notes',
    ];

    protected $casts = [
        'scheduled_for' => 'datetime',
        'picked_up_at' => 'datetime',
        'shipped_at' => 'datetime',
        'delivered_at' => 'datetime',
        'failed_at' => 'datetime',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'sale_id');
    }

    /**
     * The driver carrying this run.
     */
    public function courier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'courier_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeForCourier(Builder $query, int $courierId): Builder
    {
        return $query->where('courier_id', $courierId);
    }

    /** Runs still requiring action from the driver. */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['pending', 'dispatched', 'in_transit']);
    }

    public function scopeUnassigned(Builder $query): Builder
    {
        return $query->whereNull('courier_id');
    }
}
