<?php

namespace App\Models\Finance;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Fulfillment\Delivery;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Builder;

class Sale extends Model
{
    use HasFactory;

    /*
    |--------------------------------------------------------------------------
    | Fulfillment pipeline
    |--------------------------------------------------------------------------
    |
    | A third axis beside `status` (commercial) and `payment_status` (money):
    | where the order is on the floor. Payment moves it to PICK_PACK; it only
    | reaches TO_DELIVER once every line names the exact place it was picked
    | from, which is what OrderSourcingService::confirmSourcing() records.
    |
    */

    public const STAGE_AWAITING_PAYMENT = 'awaiting_payment';

    public const STAGE_PICK_PACK = 'pick_pack';

    public const STAGE_TO_DELIVER = 'to_deliver';

    public const STAGE_DELIVERED = 'delivered';

    public const STAGE_CANCELLED = 'cancelled';

    /** @return array<string, string> */
    public static function fulfillmentStages(): array
    {
        return [
            self::STAGE_AWAITING_PAYMENT => 'To pay',
            self::STAGE_PICK_PACK => 'Pick & pack',
            self::STAGE_TO_DELIVER => 'To deliver',
            self::STAGE_DELIVERED => 'Delivered',
            self::STAGE_CANCELLED => 'Cancelled',
        ];
    }

    protected $table = 'sales';

    protected $fillable = [
        'reference_number',
        'cart_id',
        'store_id',
        'customer_id',
        'seller_id',
        'user_id',
        'subtotal',
        'tax_amount',
        'discount_amount',
        'total_amount',
        'status',
        'payment_status',
        'fulfillment_stage',
        'delay_agreed_at',
        'sourcing_confirmed_at',
        'sourcing_confirmed_by',
        'notes',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'delay_agreed_at' => 'datetime',
        'sourcing_confirmed_at' => 'datetime',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'sale_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'sale_id');
    }

    public function delivery(): HasOne
    {
        return $this->hasOne(Delivery::class, 'sale_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class, 'cart_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', 'completed');
    }

    public function scopePaid(Builder $query): Builder
    {
        return $query->where('payment_status', 'paid');
    }

    public function scopeForStore(Builder $query, int $storeId): Builder
    {
        return $query->where('store_id', $storeId);
    }

    public function scopeForCustomer(Builder $query, int $customerId): Builder
    {
        return $query->where('customer_id', $customerId);
    }

    /** Paid orders whose lines still have to be sourced. */
    public function scopeAwaitingSourcing(Builder $query): Builder
    {
        return $query->where('fulfillment_stage', self::STAGE_PICK_PACK);
    }

    public function scopeAtStage(Builder $query, string $stage): Builder
    {
        return $query->where('fulfillment_stage', $stage);
    }

    /*
    |--------------------------------------------------------------------------
    | Fulfillment state
    |--------------------------------------------------------------------------
    */

    public function isAwaitingSourcing(): bool
    {
        return $this->fulfillment_stage === self::STAGE_PICK_PACK;
    }

    public function stageLabel(): string
    {
        return self::fulfillmentStages()[$this->fulfillment_stage] ?? 'Unknown';
    }

    /**
     * Has the buyer accepted the wait on lines coming from a main warehouse?
     *
     * Recorded at checkout because it was a condition of taking the payment.
     */
    public function delayAgreed(): bool
    {
        return $this->delay_agreed_at !== null;
    }
}
