<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hidden users (the demo accounts): only a global admin who also holds the dev
 * role sees them, in the Users list and in the Apps menu. Anyone holding the
 * dev role is hidden the same way, without needing the flag.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_hidden')->default(false)->after('is_driver');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('is_hidden');
        });
    }
};
