<?php

namespace App\Models\Items;

use App\Models\Catalog\App;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $table = 'product';

    protected $fillable = ['id',
        'userId',
        'title',
        'metaTitle',
        'slug',
        'summary',
        'type',
        'sku',
        'price',
        'discount',
        'quantity',
        'shop',
        'createdAt',
        'updatedAt',
        'publishedAt',
        'startsAt',
        'endsAt',
        'content'];

    public function userId()
    {
        return $this->belongsTo(App\Models\User::class);
    }
}
