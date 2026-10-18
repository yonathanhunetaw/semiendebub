<?php

declare(strict_types=1);

namespace App\Models\Canvas;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A person's own folder of canvases. */
class CanvasGroup extends Model
{
    /** @var array<int, string> */
    protected $fillable = ['user_id', 'name', 'position'];

    /** @var array<string, string> */
    protected $casts = ['position' => 'integer'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function canvases(): HasMany
    {
        return $this->hasMany(Canvas::class);
    }
}
