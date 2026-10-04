<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Refill requests become suggestions the store manager acts on.
 *
 * requested_quantity  what the stock keeper (or the auto trigger) asked for.
 *                     `quantity` is what is actually being sent; when the
 *                     manager changes it, the two differ and the stock keeper
 *                     is told it was adjusted.
 * target_location_id  the location being refilled: a Store Shelf, or a
 *                     Remote Hub restocking its own lines.
 * destination         for a shipment leg, where the shipment lands: the store
 *                     floor (`store`) or the store's Remote Hub (`remote_hub`).
 *
 * There is no "approved" resting state any more: the manager adding a
 * suggestion to the Remote Hub list or to a manifest is the approval. Rows
 * left `approved` with nothing carrying them go back to `pending`, so they
 * reappear as suggestions. Counts are printed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refill_requests', function (Blueprint $table): void {
            $table->unsignedInteger('requested_quantity')->nullable()->after('quantity');
            $table->foreignId('target_location_id')->nullable()->after('shelf_location_id')->constrained('stock_locations')->nullOnDelete();
            $table->string('destination', 20)->nullable()->after('source');
            $table->index(['target_location_id', 'item_id', 'status']);
        });

        DB::table('refill_requests')->whereNull('requested_quantity')->update(['requested_quantity' => DB::raw('quantity')]);
        DB::table('refill_requests')->whereNull('target_location_id')->update(['target_location_id' => DB::raw('shelf_location_id')]);
        DB::table('refill_requests')->where('source', 'shipment')->whereNull('destination')->update(['destination' => 'store']);

        $returned = DB::table('refill_requests')
            ->where('status', 'approved')
            ->whereNull('transfer_id')
            ->whereNull('shipment_id')
            ->update(['status' => 'pending', 'approved_by' => null, 'approved_at' => null]);

        // Approved and already carried (a transfer or a shipment): that is what
        // "in progress" means now.
        $carried = DB::table('refill_requests')
            ->where('status', 'approved')
            ->update(['status' => 'in_progress']);

        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            echo "  refill_requests: {$returned} approved back to pending, {$carried} approved now in progress.\n";
        }
    }

    public function down(): void
    {
        Schema::table('refill_requests', function (Blueprint $table): void {
            $table->dropIndex(['target_location_id', 'item_id', 'status']);
            $table->dropConstrainedForeignId('target_location_id');
            $table->dropColumn(['requested_quantity', 'destination']);
        });
    }
};
