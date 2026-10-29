<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Vendor V0 (docs/plans/missing-areas-prompt.md §6): a vendor is a store. Each
 * store gets a public address (`slug`, for /s/{slug}), a public profile and the
 * person who owns it. Existing stores get a slug from their name.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table): void {
            $table->string('slug', 80)->nullable()->unique()->after('name');
            $table->text('description')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('contact_phone', 40)->nullable();
            $table->string('contact_email')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
        });

        $taken = [];
        foreach (DB::table('stores')->orderBy('id')->get(['id', 'name']) as $store) {
            $base = Str::slug((string) $store->name) ?: 'store';
            $slug = $base;
            for ($n = 2; in_array($slug, $taken, true); $n++) {
                $slug = "{$base}-{$n}";
            }
            $taken[] = $slug;
            DB::table('stores')->where('id', $store->id)->update(['slug' => $slug]);
        }
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('owner_id');
            $table->dropUnique(['slug']);
            $table->dropColumn(['slug', 'description', 'logo_path', 'contact_phone', 'contact_email']);
        });
    }
};
