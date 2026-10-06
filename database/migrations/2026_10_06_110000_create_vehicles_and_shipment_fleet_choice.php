<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The fleet: the cars a shipment can be carried in, managed by admin.
 *
 * A shipment's creator picks one car and the drivers allowed to take the run.
 * Only those drivers see it on their board and may agree to a time. The
 * vehicle_name / plate / max_cbm columns stay as the copy the screens read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('plate')->unique();
            $table->decimal('max_cbm', 8, 2)->default(0);
            $table->unsignedInteger('payload_kg')->default(0);
            $table->string('status')->default('active');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::table('shipments', function (Blueprint $table) {
            $table->foreignId('vehicle_id')->nullable()->after('vehicle_max_cbm')
                ->constrained('vehicles')->nullOnDelete();
            $table->json('eligible_courier_ids')->nullable()->after('courier_id');
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('vehicle_id');
            $table->dropColumn('eligible_courier_ids');
        });

        Schema::dropIfExists('vehicles');
    }
};
