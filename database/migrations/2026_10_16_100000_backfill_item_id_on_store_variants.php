<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Store listings saved with only their variant had no item_id, so anything that
 * read a listing's item (Admin → Customers → Prices & discounts showed "Unknown
 * item" on every row) found none. Fill it in from the variant. StoreVariant now
 * does this itself on save.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            'UPDATE store_variants SET item_id = (SELECT item_variants.item_id FROM item_variants WHERE item_variants.id = store_variants.item_variant_id) WHERE item_id IS NULL'
        );
    }

    public function down(): void
    {
        // Nothing to undo: the filled-in ids are correct.
    }
};
