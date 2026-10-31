<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The business rules a global admin changes in Settings (one row). A null column
 * keeps the value from config / .env; see App\Services\Admin\BusinessRules.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('unpaid_reservation_minutes')->nullable();
            $table->unsignedSmallInteger('cash_flag_days')->nullable();
            $table->unsignedSmallInteger('archive_after_days')->nullable();
            $table->string('same_day_promise', 60)->nullable();
            $table->string('delayed_promise', 60)->nullable();
            $table->boolean('auto_replenishment')->nullable();
            $table->boolean('replenish_on_stock_change')->nullable();
            $table->boolean('shelf_refill_on_stock_change')->nullable();
            $table->unsignedInteger('storefront_low_stock_threshold')->nullable();
            $table->unsignedSmallInteger('storefront_per_page')->nullable();
            $table->unsignedInteger('storefront_max_line_quantity')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('business_settings');
    }
};
