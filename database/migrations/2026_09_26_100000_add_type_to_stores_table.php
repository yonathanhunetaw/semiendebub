<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A shipment moves between two facilities, and a facility may be a retail
 * store, a central warehouse or a remote warehouse.
 *
 * The inventory ledger already keys store-held stock on Store::class, and
 * shipments already reference stores at both ends, so facilities stay Store
 * rows and gain a type rather than becoming polymorphic. That keeps one ledger
 * vocabulary instead of two.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table): void {
            if (! Schema::hasColumn('stores', 'type')) {
                $table->string('type')->default('retail')->after('name')->index();
            }

            if (! Schema::hasColumn('stores', 'code')) {
                $table->string('code')->nullable()->after('type');
            }
        });

        // Existing rows are retail outlets; warehouse-type facilities are added
        // by the facility seeder.
        DB::table('stores')->whereNull('type')->update(['type' => 'retail']);
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table): void {
            foreach (['type', 'code'] as $column) {
                if (Schema::hasColumn('stores', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
