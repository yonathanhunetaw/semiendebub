<?php

namespace App\Models\Auth;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use Database\Factories\User\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasFactory, HasRoles, Notifiable;

    protected $guard_name = 'web';

    // Explicitly set the guard name
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'first_name', 'last_name', 'phone_number', 'email', 'role', 'password',
        'store_id', 'inventory_location_id', 'created_by',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Link this model to its factory.
     */
    protected static function newFactory()
    {
        return UserFactory::new();
    }

    /**
     * Get the customers created by the user.
     */
    public function customers()
    {
        return $this->hasMany(Customer::class, 'created_by');  // Inverse of 'belongsTo' in Customer
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Set the role attribute to lowercase before storing in the database.
     */
    public function setRoleAttribute($value)
    {
        // $this->attributes['role'] = strtolower($value);
        // Store role as lowercase and underscore-separated format
        $this->attributes['role'] = strtolower(str_replace(' ', '_', $value));
    }

    /**
     * Format the role for display purposes (e.g., "Stock Keeper").
     */
    public function getRoleAttribute($value)
    {
        // return ucwords(str_replace('_', ' ', strtolower($value)));

        // Format role for display purposes by replacing underscores with spaces and capitalizing the first letter
        return ucwords(str_replace('_', ' ', strtolower($value)));
    }

    /**
     * Define the relationship to carts.
     * A user can create multiple carts.
     */
    public function carts()
    {
        return $this->hasMany(Cart::class);
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
