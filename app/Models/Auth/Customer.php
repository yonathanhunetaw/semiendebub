<?php

namespace App\Models\Auth;

use App\Models\Seller\Cart;
use App\Models\Auth\User; // Ensure this import exists
use Database\Factories\Customer\CustomerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Casts\Attribute; // 1. Add this for modern Accessors

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'first_name',
        'last_name',
        'phone_number',
        'email',
        'city',
        'created_by',
        'store_id',
        'tin_number',
    ];

    /**
     * 2. The attributes that should be appended to the model's array form.
     * This makes 'name' visible to Inertia/React.
     */
    protected $appends = ['name'];

    /**
     * 3. Define the 'name' accessor.
     */
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn () => trim("{$this->first_name} {$this->last_name}"),
        );
    }

    protected static function newFactory()
    {
        return CustomerFactory::new();
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function carts()
    {
        return $this->hasMany(Cart::class);
    }
}
