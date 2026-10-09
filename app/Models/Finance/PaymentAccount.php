<?php

declare(strict_types=1);

namespace App\Models\Finance;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A bank account or wallet the admin set up for a store.
 *
 * Collection accounts are what a customer pays into at checkout; the owner is
 * the seller who sees the deposit arrive and confirms it. Settlement accounts
 * are where sellers later hand that money over to.
 */
class PaymentAccount extends Model
{
    use SoftDeletes;

    public const TYPE_BANK = 'bank';

    public const TYPE_WALLET = 'wallet';

    public const PURPOSE_COLLECTION = 'collection';

    public const PURPOSE_SETTLEMENT = 'settlement';

    protected $table = 'payment_accounts';

    protected $fillable = [
        'store_id',
        'type',
        'provider',
        'account_number',
        'account_name',
        'owner_user_id',
        'purpose',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'payment_account_id');
    }

    /** For a settlement account: the sellers who hand money over to it. */
    public function remitters(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'seller_settlement_accounts', 'payment_account_id', 'user_id')->withTimestamps();
    }

    /** Active collection accounts a seller at this store may take money into. */
    public function scopeCollectingFor(Builder $query, int $storeId): Builder
    {
        return $query->where('store_id', $storeId)
            ->where('purpose', self::PURPOSE_COLLECTION)
            ->where('is_active', true);
    }

    public function providerName(): string
    {
        return (string) (config("payments.providers.{$this->provider}.name") ?? $this->provider);
    }

    /** "CBE · 1000 2145 88721" */
    public function label(): string
    {
        return $this->providerName().' · '.$this->account_number;
    }
}
