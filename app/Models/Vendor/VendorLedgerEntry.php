<?php

declare(strict_types=1);

namespace App\Models\Vendor;

use App\Models\Finance\Sale;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line of a vendor's money: an order earned, an order reversed, or a payout. Written only by VendorMoney. */
class VendorLedgerEntry extends Model
{
    public const KIND_EARNING = 'earning';

    public const KIND_REVERSAL = 'reversal';

    public const KIND_PAYOUT = 'payout';

    protected $fillable = ['store_id', 'kind', 'sale_id', 'payout_id', 'gross', 'commission_pct', 'commission', 'amount'];

    protected $casts = ['gross' => 'float', 'commission_pct' => 'float', 'commission' => 'float', 'amount' => 'float'];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
