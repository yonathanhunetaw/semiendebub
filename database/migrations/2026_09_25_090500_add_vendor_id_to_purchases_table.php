<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Purchases identified their supplier only by free-text name, so a vendor had
 * no way to see their own orders. This adds the FK the Vendor portal needs
 * while leaving `supplier_name` in place for historical rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table): void {
            if (! Schema::hasColumn('purchases', 'vendor_id')) {
                $table->foreignId('vendor_id')
                    ->nullable()
                    ->after('supplier_name')
                    ->constrained('users')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('purchases', 'expected_at')) {
                $table->timestamp('expected_at')->nullable()->after('purchased_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('purchases', function (Blueprint $table): void {
            if (Schema::hasColumn('purchases', 'vendor_id')) {
                $table->dropConstrainedForeignId('vendor_id');
            }

            if (Schema::hasColumn('purchases', 'expected_at')) {
                $table->dropColumn('expected_at');
            }
        });
    }
};
