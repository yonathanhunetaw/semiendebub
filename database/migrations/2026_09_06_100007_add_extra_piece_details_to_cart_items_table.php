<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            $table->integer('extra_pieces')->default(0)->after('quantity');
            $table->decimal('extra_piece_price', 15, 2)->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            $table->dropColumn(['extra_pieces', 'extra_piece_price']);
        });
    }
};
