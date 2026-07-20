<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('canvases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title')->default('Untitled Canvas');
            $table->timestamps();
        });

        Schema::create('canvas_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('canvas_id')->constrained('canvases')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('permission', ['view', 'edit'])->default('edit');
            $table->timestamps();
            
            $table->unique(['canvas_id', 'user_id']);
        });

        Schema::table('canvas_versions', function (Blueprint $table) {
            $table->foreignId('canvas_id')->nullable()->after('id')->constrained('canvases')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('canvas_versions', function (Blueprint $table) {
            $table->dropForeign(['canvas_id']);
            $table->dropColumn('canvas_id');
        });
        
        Schema::dropIfExists('canvas_shares');
        Schema::dropIfExists('canvases');
    }
};
