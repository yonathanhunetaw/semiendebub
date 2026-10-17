<?php

declare(strict_types=1);

namespace App\Models\Workforce;

use App\Models\Inventory\StockLocation;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** "At least N people of a role at a site between two times on these weekdays." */
class StaffingRule extends Model
{
    public const ROLE_SELLER = 'seller';

    public const ROLE_STOCK_KEEPER = 'stock_keeper';

    public const ROLE_ANY = 'any';

    public const ROLES = [self::ROLE_SELLER, self::ROLE_STOCK_KEEPER, self::ROLE_ANY];

    protected $fillable = ['stock_location_id', 'weekdays', 'starts_at', 'ends_at', 'role', 'min_people'];

    protected $casts = [
        'stock_location_id' => 'integer',
        'weekdays' => 'array',
        'min_people' => 'integer',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(StockLocation::class, 'stock_location_id');
    }
}
