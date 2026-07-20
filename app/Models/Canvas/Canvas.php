<?php

namespace App\Models\Canvas;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Auth\User;

class Canvas extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'user_id', 
        'title'
    ];

    /**
     * Get the user that owns the canvas.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the users this canvas is shared with.
     */
    public function shares(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'canvas_shares', 'canvas_id', 'user_id')
                    ->withPivot('permission')
                    ->withTimestamps();
    }

    /**
     * Get the versions for this canvas.
     */
    public function versions(): HasMany
    {
        return $this->hasMany(CanvasVersion::class);
    }
}
