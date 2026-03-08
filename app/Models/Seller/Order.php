<?php

namespace App\Models\Seller;

use App\Models\Auth\Customer;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'order';

    protected $fillable = ['id', 'userId', 'customerId', 'sessionId', 'token', 'status', 'subTotal', 'itemDiscount', 'tax', 'shipping', 'total', 'promo', 'discount', 'grandTotal', 'createdAt', 'updatedAt', 'content'];

    public function customerId()
    {
        return $this->belongsTo(Customer::class);
    }

    public function userId()
    {
        return $this->belongsTo(User::class);
    }
}
