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
        // 1. Upgrade `sales` table
        if (Schema::hasTable('sales')) {
            Schema::table('sales', function (Blueprint $table) {
                if (!Schema::hasColumn('sales', 'reference_number')) {
                    $table->string('reference_number')->nullable()->unique()->after('id');
                }
                if (!Schema::hasColumn('sales', 'cart_id')) {
                    $table->foreignId('cart_id')->nullable()->after('reference_number')->constrained('carts')->nullOnDelete();
                }
                if (!Schema::hasColumn('sales', 'store_id')) {
                    $table->foreignId('store_id')->nullable()->after('cart_id')->constrained('stores')->cascadeOnDelete();
                }
                if (!Schema::hasColumn('sales', 'customer_id')) {
                    $table->foreignId('customer_id')->nullable()->after('store_id')->constrained('customers')->nullOnDelete();
                }
                if (!Schema::hasColumn('sales', 'seller_id')) {
                    $table->foreignId('seller_id')->nullable()->after('customer_id')->constrained('users')->nullOnDelete();
                }
                if (!Schema::hasColumn('sales', 'user_id')) {
                    $table->foreignId('user_id')->nullable()->after('seller_id')->constrained('users')->nullOnDelete();
                }
                if (!Schema::hasColumn('sales', 'subtotal')) {
                    $table->decimal('subtotal', 15, 2)->default(0)->after('user_id');
                }
                if (!Schema::hasColumn('sales', 'tax_amount')) {
                    $table->decimal('tax_amount', 15, 2)->default(0)->after('subtotal');
                }
                if (!Schema::hasColumn('sales', 'discount_amount')) {
                    $table->decimal('discount_amount', 15, 2)->default(0)->after('tax_amount');
                }
                if (!Schema::hasColumn('sales', 'total_amount')) {
                    $table->decimal('total_amount', 15, 2)->default(0)->after('discount_amount');
                }
                if (!Schema::hasColumn('sales', 'status')) {
                    $table->enum('status', ['pending', 'completed', 'canceled', 'refunded'])->default('completed')->after('total_amount');
                }
                if (!Schema::hasColumn('sales', 'payment_status')) {
                    $table->enum('payment_status', ['unpaid', 'partially_paid', 'paid'])->default('unpaid')->after('status');
                }
                if (!Schema::hasColumn('sales', 'notes')) {
                    $table->text('notes')->nullable()->after('payment_status');
                }
            });
        }

        // 2. Create `sale_items` table
        if (!Schema::hasTable('sale_items')) {
            Schema::create('sale_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
                $table->foreignId('store_variant_id')->constrained('store_variants')->cascadeOnDelete();
                $table->unsignedInteger('quantity')->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('subtotal', 15, 2)->default(0);
                $table->decimal('tax_amount', 15, 2)->default(0);
                $table->decimal('discount_amount', 15, 2)->default(0);
                $table->decimal('total_price', 15, 2)->default(0);
                $table->timestamps();

                $table->index(['sale_id', 'store_variant_id']);
            });
        }

        // 3. Create `payments` table
        if (!Schema::hasTable('payments')) {
            Schema::create('payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
                $table->string('payment_method')->default('cash'); // cash, card, bank_transfer, mobile_money, telebirr, cbe_birr
                $table->decimal('amount', 15, 2);
                $table->string('currency', 10)->default('ETB');
                $table->string('transaction_reference')->nullable()->index();
                $table->enum('status', ['pending', 'completed', 'failed', 'refunded'])->default('completed');
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('paid_at')->useCurrent();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index(['sale_id', 'status']);
            });
        }

        // 4. Create `deliveries` table
        if (!Schema::hasTable('deliveries')) {
            Schema::create('deliveries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
                $table->string('tracking_number')->nullable()->unique();
                $table->enum('status', ['pending', 'dispatched', 'in_transit', 'delivered', 'failed', 'returned'])->default('pending');
                $table->text('delivery_address')->nullable();
                $table->string('recipient_name')->nullable();
                $table->string('recipient_phone', 30)->nullable();
                $table->string('courier_name')->nullable();
                $table->timestamp('shipped_at')->nullable();
                $table->timestamp('delivered_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index(['sale_id', 'status']);
            });
        }

        // 5. Upgrade `purchases` table
        if (Schema::hasTable('purchases')) {
            Schema::table('purchases', function (Blueprint $table) {
                if (!Schema::hasColumn('purchases', 'reference_number')) {
                    $table->string('reference_number')->nullable()->unique()->after('id');
                }
                if (!Schema::hasColumn('purchases', 'store_id')) {
                    $table->foreignId('store_id')->nullable()->after('reference_number')->constrained('stores')->nullOnDelete();
                }
                if (!Schema::hasColumn('purchases', 'warehouse_id')) {
                    $table->foreignId('warehouse_id')->nullable()->after('store_id')->constrained('warehouses')->nullOnDelete();
                }
                if (!Schema::hasColumn('purchases', 'supplier_name')) {
                    $table->string('supplier_name')->nullable()->after('warehouse_id');
                }
                if (!Schema::hasColumn('purchases', 'total_amount')) {
                    $table->decimal('total_amount', 15, 2)->default(0)->after('supplier_name');
                }
                if (!Schema::hasColumn('purchases', 'status')) {
                    $table->enum('status', ['pending', 'received', 'canceled'])->default('pending')->after('total_amount');
                }
                if (!Schema::hasColumn('purchases', 'user_id')) {
                    $table->foreignId('user_id')->nullable()->after('status')->constrained('users')->nullOnDelete();
                }
                if (!Schema::hasColumn('purchases', 'purchased_at')) {
                    $table->timestamp('purchased_at')->nullable()->after('user_id');
                }
                if (!Schema::hasColumn('purchases', 'notes')) {
                    $table->text('notes')->nullable()->after('purchased_at');
                }
            });
        }

        // 6. Upgrade `transfers` table
        if (Schema::hasTable('transfers')) {
            Schema::table('transfers', function (Blueprint $table) {
                if (!Schema::hasColumn('transfers', 'store_variant_id')) {
                    $table->foreignId('store_variant_id')
                        ->nullable()
                        ->after('item_variant_id')
                        ->constrained('store_variants')
                        ->nullOnDelete();
                }
                if (!Schema::hasColumn('transfers', 'from_store_id')) {
                    $table->foreignId('from_store_id')
                        ->nullable()
                        ->after('store_variant_id')
                        ->constrained('stores')
                        ->nullOnDelete();
                }
                if (!Schema::hasColumn('transfers', 'to_store_id')) {
                    $table->foreignId('to_store_id')
                        ->nullable()
                        ->after('from_store_id')
                        ->constrained('stores')
                        ->nullOnDelete();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('deliveries');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('sale_items');

        if (Schema::hasTable('sales')) {
            Schema::table('sales', function (Blueprint $table) {
                $columns = [
                    'reference_number', 'cart_id', 'store_id', 'customer_id',
                    'seller_id', 'user_id', 'subtotal', 'tax_amount',
                    'discount_amount', 'total_amount', 'status', 'payment_status', 'notes'
                ];
                foreach ($columns as $column) {
                    if (Schema::hasColumn('sales', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (Schema::hasTable('purchases')) {
            Schema::table('purchases', function (Blueprint $table) {
                $columns = [
                    'reference_number', 'store_id', 'warehouse_id', 'supplier_name',
                    'total_amount', 'status', 'user_id', 'purchased_at', 'notes'
                ];
                foreach ($columns as $column) {
                    if (Schema::hasColumn('purchases', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
