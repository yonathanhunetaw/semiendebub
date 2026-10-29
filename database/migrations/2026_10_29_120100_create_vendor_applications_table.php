<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vendor V1: a business asks to open a store on Duka; a global admin approves
 * (creating the store and its owner) or rejects with a reason.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendor_applications', function (Blueprint $table): void {
            $table->id();
            $table->string('business_name');
            $table->string('contact_first_name');
            $table->string('contact_last_name')->nullable();
            $table->string('email');
            $table->string('phone_number', 40);
            $table->string('city')->nullable();
            $table->string('tin_number', 40)->nullable();
            $table->text('description')->nullable();
            $table->string('status', 20)->default('pending')->index();
            $table->text('reject_reason')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_applications');
    }
};
