<?php

declare(strict_types=1);

namespace App\Models\Vendor;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Money paid out to a vendor: recorded by one person, confirmed by another (VendorMoney). */
class VendorPayout extends Model
{
    public const STATUS_RECORDED = 'recorded';

    public const STATUS_CONFIRMED = 'confirmed';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = ['store_id', 'amount', 'method', 'reference', 'status', 'recorded_by', 'confirmed_by', 'confirmed_at', 'reject_reason'];

    protected $casts = ['amount' => 'float', 'confirmed_at' => 'datetime'];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }
}
