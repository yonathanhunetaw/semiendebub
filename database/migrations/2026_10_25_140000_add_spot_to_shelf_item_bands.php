<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which physical slot of the racks an item's shelf bin stands on ("f6c": column f, row 6, the third of the spot's four
 * slots). Until now the world laid the bins on the racks in the shelf's own order, because the placement was not
 * recorded; a shelf manager can now put each item on a slot. Empty = not placed: the world still fills those in order.
 * A slot holds one item (unique per shelf; any number of unplaced rows share the NULL).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shelf_item_bands', function (Blueprint $table): void {
            $table->string('spot', 8)->nullable()->after('item_packaging_type_id');
            $table->unique(['stock_location_id', 'spot'], 'shelf_item_bands_slot_unique');
        });
    }

    public function down(): void
    {
        Schema::table('shelf_item_bands', function (Blueprint $table): void {
            $table->dropUnique('shelf_item_bands_slot_unique');
            $table->dropColumn('spot');
        });
    }
};
