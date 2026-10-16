<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The foreign (or local) shops procurement buys from. No login: a supplier
 * is a record, not a user. The vendor role (`purchases.vendor_id`) is a
 * separate, older idea and stays as it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('country', 80)->nullable();
            $table->string('city', 80)->nullable();
            $table->char('currency', 3)->default('USD');
            $table->string('phone', 40)->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            // [{name, role, phone, email}]
            $table->json('contacts')->nullable();
            $table->string('default_payment_terms', 20)->default('immediate');
            $table->unsignedSmallInteger('default_payment_days')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['is_active', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers');
    }
};
