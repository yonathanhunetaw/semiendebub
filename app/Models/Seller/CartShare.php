<?php

declare(strict_types=1);

namespace App\Models\Seller;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A cart shared with its customer through a secret link. Created, looked up
 * and revoked only through App\Services\Shared\CartShareService.
 */
class CartShare extends Model
{
    protected $fillable = [
        'cart_id',
        'customer_id',
        'created_by',
        'token_hash',
        'token',
        'expires_at',
        'revoked_at',
        'revoked_by',
        'opened_at',
        'last_seen_at',
        'customer_edited_at',
        'checked_out_at',
        'sale_id',
    ];

    protected $hidden = ['token', 'token_hash'];

    protected $casts = [
        'token' => 'encrypted',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'opened_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'customer_edited_at' => 'datetime',
        'checked_out_at' => 'datetime',
    ];

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** Still opens: not revoked and not expired. */
    public function isLive(): bool
    {
        return $this->revoked_at === null && $this->expires_at->isFuture();
    }

    /** opened / editing / checked out, for the seller's cart card. */
    public function stage(): string
    {
        return match (true) {
            $this->checked_out_at !== null => 'checked_out',
            $this->revoked_at !== null => 'revoked',
            ! $this->expires_at->isFuture() => 'expired',
            $this->customer_edited_at !== null => 'editing',
            $this->opened_at !== null => 'opened',
            default => 'sent',
        };
    }
}
