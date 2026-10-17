<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One hand-over of a key. Starts claimed (the holder says "I gave it to you");
 * the receiver accepts (they now hold it) or rejects (it stays with the giver).
 * A manager may force a key to someone, for a lost key or an absent holder.
 */
class KeyHandover extends Model
{
    public const STATUS_CLAIMED = 'claimed';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_FORCED = 'forced';

    /** Why the key moved. Free of rules; it is shown in the log. */
    public const REASONS = ['shift_change', 'opening', 'closing', 'return', 'trip', 'other'];

    protected $fillable = ['custody_key_id', 'from_id', 'to_id', 'status', 'reason', 'note', 'created_by', 'decided_at'];

    protected $casts = [
        'custody_key_id' => 'integer',
        'from_id' => 'integer',
        'to_id' => 'integer',
        'created_by' => 'integer',
        'decided_at' => 'datetime',
    ];

    public function key(): BelongsTo
    {
        return $this->belongsTo(CustodyKey::class, 'custody_key_id');
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
