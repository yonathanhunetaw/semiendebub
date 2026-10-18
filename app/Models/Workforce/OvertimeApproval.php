<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A manager's yes or no on one person's overtime on one day. It holds the
 * minutes it was about; if the clock rows change after, the day asks again.
 */
class OvertimeApproval extends Model
{
    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = ['user_id', 'date', 'status', 'minutes', 'decided_by', 'note'];

    protected $casts = [
        'user_id' => 'integer',
        'date' => 'date',
        'minutes' => 'integer',
        'decided_by' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
