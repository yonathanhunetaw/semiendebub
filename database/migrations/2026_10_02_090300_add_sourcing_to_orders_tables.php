<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The sourcing decisions a paid order carries from checkout to the van.
 *
 * `sales.status` is a commercial state (completed / canceled / refunded) and
 * `payment_status` is about money. Neither says where the order is on the
 * floor, so the pipeline the screens show — pay → pick & pack → to deliver —
 * had nowhere to live. `fulfillment_stage` is that axis.
 *
 * The rule it enforces: an order reaches `to_deliver` only once every line
 * names the exact place it was picked from. Those places land on
 * `sale_items.source_location_*`, in the same polymorphic vocabulary as
 * `item_stocks`, and the Delivery inherits the handover location from them —
 * a delivery originates from a real shelf, back room or warehouse, never from
 * "the store" in the abstract.
 *
 * `delay_agreed_at` is the buyer's acceptance that part of the order ships
 * from a main warehouse and therefore arrives later. It is stored because it
 * was a condition of the payment, not a UI preference.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sales')) {
            Schema::table('sales', function (Blueprint $table): void {
                if (! Schema::hasColumn('sales', 'fulfillment_stage')) {
                    // awaiting_payment | pick_pack | to_deliver | delivered | cancelled
                    $table->string('fulfillment_stage')->default('awaiting_payment')->after('payment_status')->index();
                }

                if (! Schema::hasColumn('sales', 'delay_agreed_at')) {
                    $table->timestamp('delay_agreed_at')->nullable()->after('fulfillment_stage');
                }

                if (! Schema::hasColumn('sales', 'sourcing_confirmed_at')) {
                    $table->timestamp('sourcing_confirmed_at')->nullable()->after('delay_agreed_at');
                    $table->foreignId('sourcing_confirmed_by')->nullable()->after('sourcing_confirmed_at')
                        ->constrained('users')->nullOnDelete();
                }
            });

            // Historic sales predate the pipeline; a paid one is finished, an
            // unpaid one is still waiting for money.
            DB::table('sales')->where('payment_status', 'paid')->update(['fulfillment_stage' => 'delivered']);
        }

        if (Schema::hasTable('sale_items')) {
            Schema::table('sale_items', function (Blueprint $table): void {
                if (! Schema::hasColumn('sale_items', 'source_location_type')) {
                    $table->string('source_location_type')->nullable()->after('store_variant_id');
                    $table->unsignedBigInteger('source_location_id')->nullable()->after('source_location_type');
                }

                if (! Schema::hasColumn('sale_items', 'picked_quantity')) {
                    $table->unsignedInteger('picked_quantity')->default(0)->after('quantity');
                    $table->timestamp('picked_at')->nullable()->after('picked_quantity');
                    $table->foreignId('picked_by')->nullable()->after('picked_at')
                        ->constrained('users')->nullOnDelete();
                    $table->timestamp('packed_at')->nullable()->after('picked_by');
                }
            });

            Schema::table('sale_items', function (Blueprint $table): void {
                $table->index(['source_location_type', 'source_location_id'], 'sale_items_source_location_index');
            });
        }

        if (Schema::hasTable('deliveries')) {
            Schema::table('deliveries', function (Blueprint $table): void {
                if (! Schema::hasColumn('deliveries', 'source_location_type')) {
                    $table->string('source_location_type')->nullable()->after('sale_id');
                    $table->unsignedBigInteger('source_location_id')->nullable()->after('source_location_type');
                }

                if (! Schema::hasColumn('deliveries', 'source_store_id')) {
                    $table->foreignId('source_store_id')->nullable()->after('source_location_id')
                        ->constrained('stores')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('deliveries')) {
            Schema::table('deliveries', function (Blueprint $table): void {
                if (Schema::hasColumn('deliveries', 'source_store_id')) {
                    $table->dropConstrainedForeignId('source_store_id');
                }
            });

            Schema::table('deliveries', function (Blueprint $table): void {
                foreach (['source_location_type', 'source_location_id'] as $column) {
                    if (Schema::hasColumn('deliveries', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (Schema::hasTable('sale_items')) {
            Schema::table('sale_items', function (Blueprint $table): void {
                $table->dropIndex('sale_items_source_location_index');
            });

            Schema::table('sale_items', function (Blueprint $table): void {
                if (Schema::hasColumn('sale_items', 'picked_by')) {
                    $table->dropConstrainedForeignId('picked_by');
                }
            });

            Schema::table('sale_items', function (Blueprint $table): void {
                $columns = array_values(array_filter([
                    'source_location_type', 'source_location_id',
                    'picked_quantity', 'picked_at', 'packed_at',
                ], fn (string $column): bool => Schema::hasColumn('sale_items', $column)));

                if ($columns !== []) {
                    $table->dropColumn($columns);
                }
            });
        }

        if (Schema::hasTable('sales')) {
            Schema::table('sales', function (Blueprint $table): void {
                if (Schema::hasColumn('sales', 'sourcing_confirmed_by')) {
                    $table->dropConstrainedForeignId('sourcing_confirmed_by');
                }
            });

            Schema::table('sales', function (Blueprint $table): void {
                $columns = array_values(array_filter([
                    'fulfillment_stage', 'delay_agreed_at', 'sourcing_confirmed_at',
                ], fn (string $column): bool => Schema::hasColumn('sales', $column)));

                if ($columns !== []) {
                    $table->dropColumn($columns);
                }
            });
        }
    }
};
