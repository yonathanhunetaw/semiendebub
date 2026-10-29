<?php

declare(strict_types=1);

namespace App\Models\Vendor;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A business asking to open its own store on Duka (vendor V1). Approved or
 * rejected only through App\Services\Vendor\VendorOnboarding.
 */
class VendorApplication extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'business_name',
        'contact_first_name',
        'contact_last_name',
        'email',
        'phone_number',
        'city',
        'tin_number',
        'description',
        'status',
        'reject_reason',
        'reviewed_by',
        'reviewed_at',
        'store_id',
        'user_id',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
