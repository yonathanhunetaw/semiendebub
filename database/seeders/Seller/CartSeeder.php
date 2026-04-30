<?php

namespace Database\Seeders\Seller;

use App\Models\Seller\Cart;
use App\Models\Auth\User;
use App\Models\Auth\Customer;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CartSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Get necessary dependencies
        $store = Store::first() ?? Store::factory()->create();
        $seller = User::where('role', 'seller')->first() ?? User::factory()->create(['role' => 'seller', 'store_id' => $store->id]);
        $customer = Customer::first() ?? Customer::factory()->create();
        $variants = ItemVariant::take(5)->get();

        if ($variants->isEmpty()) {
            $this->command->warn("No ItemVariants found. Skipping CartSeeder. Run ItemSeeder first!");
            return;
        }

        // SCENARIO A: The Professional Seller Cart (For a specific Customer)
        $sellerCart = Cart::create([
            'store_id'    => $store->id,
            'user_id'     => $seller->id,
            'seller_id'   => $seller->id,
            'customer_id' => $customer->id,
            'status'      => 'pending',
        ]);

        // Add 3 variants to this cart
        foreach ($variants->random(3) as $variant) {
            $sellerCart->variants()->attach($variant->id, [
                'quantity' => rand(1, 10),
                'price'    => 150.00, // Captured price
                'store_id' => $store->id,
            ]);
        }

        // SCENARIO B: The Guest Visitor Cart (Anonymous)
        $guestCart = Cart::create([
            'store_id'   => $store->id,
            'user_id'    => null,
            'session_id' => Str::random(40),
            'status'     => 'pending',
        ]);

        $guestCart->variants()->attach($variants->first()->id, [
            'quantity' => 1,
            'price'    => 200.00,
            'store_id' => $store->id,
        ]);

        // SCENARIO C: A Completed Transaction
        $oldCart = Cart::create([
            'store_id'    => $store->id,
            'user_id'     => $seller->id,
            'customer_id' => $customer->id,
            'status'      => 'completed',
        ]);

        $oldCart->variants()->attach($variants->last()->id, [
            'quantity' => 5,
            'price'    => 120.50,
            'store_id' => $store->id,
        ]);
    }
}
