<?php

declare(strict_types=1);

namespace App\Models\Procurement;

use Illuminate\Database\Eloquent\Model;

/**
 * Procurement rules a global admin changes in the app (one row). Until a row exists the
 * values come from config/procurement.php.
 */
class ProcurementSetting extends Model
{
    protected $fillable = ['admin_approval_etb', 'updated_by'];

    protected $casts = [
        'admin_approval_etb' => 'float',
    ];
}
