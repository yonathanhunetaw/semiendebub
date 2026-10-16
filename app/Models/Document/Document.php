<?php

declare(strict_types=1);

namespace App\Models\Document;

use App\Models\Auth\User;
use App\Models\Calendar\CalendarEvent;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An uploaded document (a receipt or a bill), kept privately on its disk.
 * App\Services\Documents\DocumentService stores and reads it; `reading` is
 * App\Services\Documents\ReceiptReading::toArray().
 */
class Document extends Model
{
    public const STATUS_UNREAD = 'unread';

    public const STATUS_READ = 'read';

    public const STATUS_FAILED = 'failed';

    public const STATUS_ADDED = 'added';

    protected $table = 'documents';

    protected $fillable = [
        'store_id',
        'uploaded_by',
        'disk',
        'path',
        'original_name',
        'mime_type',
        'size',
        'status',
        'reading',
        'read_error',
        'calendar_event_id',
    ];

    protected $casts = [
        'size' => 'integer',
        'reading' => 'array',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function calendarEvent(): BelongsTo
    {
        return $this->belongsTo(CalendarEvent::class);
    }

    public function isImage(): bool
    {
        return str_starts_with($this->mime_type, 'image/');
    }
}
