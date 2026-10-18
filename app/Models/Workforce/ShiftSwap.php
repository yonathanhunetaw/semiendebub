<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A shift offered to a colleague. Offered → taken (the colleague agrees) →
 * approved (a manager agrees; the shift is the colleague's). Only
 * App\Services\Workforce\SwapService changes `status`.
 */
class ShiftSwap extends Model
{
    public const STATUS_OFFERED = 'offered';

    public const STATUS_TAKEN = 'taken';

    public const STATUS_APPROVED = 'approved';

    /** The colleague said no. */
    public const STATUS_DECLINED = 'declined';

    /** The manager said no. */
    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    public const OPEN = [self::STATUS_OFFERED, self::STATUS_TAKEN];

    protected $fillable = ['shift_id', 'from_id', 'to_id', 'status', 'note', 'taken_at', 'decided_by', 'decided_at', 'decision_note'];

    protected $casts = [
        'shift_id' => 'integer',
        'from_id' => 'integer',
        'to_id' => 'integer',
        'taken_at' => 'datetime',
        'decided_at' => 'datetime',
    ];

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_id');
    }
}
