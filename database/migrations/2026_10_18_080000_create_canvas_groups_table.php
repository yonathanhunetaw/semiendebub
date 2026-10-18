<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Personal folders for canvases. A canvas with no group sits in the
     * automatic "General" group.
     */
    public function up(): void
    {
        Schema::create('canvas_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::table('canvases', function (Blueprint $table) {
            $table->foreignId('canvas_group_id')->nullable()->after('store_id')->constrained('canvas_groups')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('canvases', function (Blueprint $table) {
            $table->dropConstrainedForeignId('canvas_group_id');
        });

        Schema::dropIfExists('canvas_groups');
    }
};
