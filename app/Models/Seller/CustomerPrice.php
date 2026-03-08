<?php

namespace App\Models\Seller;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use Illuminate\Database\Eloquent\Model;

class CustomerPrice extends Model
{
    protected $table = 'item_variant_customer_prices'; // match your migration

    protected $fillable = [
        'item_variant_id',
        'customer_id',
        'price',
        'discount_price',
        'discount_ends_at',
    ];

    public function variant()
    {
        return $this->belongsTo(ItemVariant::class, 'item_variant_id');
    }

    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id'); // if customers are in users table
    }
}
