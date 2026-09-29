<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table): void {
            if (! Schema::hasColumn('shipments', 'schedule_options')) {
                $table->json('schedule_options')->nullable()->after('scheduled_for');
            }

            if (! Schema::hasColumn('shipments', 'agreed_scheduled_for')) {
                $table->timestamp('agreed_scheduled_for')->nullable()->after('schedule_options');
            }

            if (! Schema::hasColumn('shipments', 'party_agreements')) {
                $table->json('party_agreements')->nullable()->after('agreed_scheduled_for');
            }
        });

        // Safely widen status column to string without triggering doctrine/dbal errors
        if (Schema::hasColumn('shipments', 'status')) {
            $driver = DB::getDriverName();
            if ($driver === 'mysql') {
                DB::statement("ALTER TABLE shipments MODIFY COLUMN status VARCHAR(255) NOT NULL DEFAULT 'draft'");
            } elseif ($driver === 'pgsql') {
                DB::statement("ALTER TABLE shipments ALTER COLUMN status TYPE VARCHAR(255), ALTER COLUMN status SET DEFAULT 'draft'");
            } else {
                Schema::table('shipments', function (Blueprint $table): void {
                    $table->string('status')->default('draft')->change();
                });
            }
        }
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table): void {
            foreach (['schedule_options', 'agreed_scheduled_for', 'party_agreements'] as $column) {
                if (Schema::hasColumn('shipments', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};