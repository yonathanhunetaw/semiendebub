<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SupplierTest extends TestCase
{
    use RefreshDatabase;

    private User $buyer;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('procurement');
        $this->buyer = User::factory()->create(['role' => 'procurement', 'email_verified_at' => now()]);
        $this->buyer->assignRole('procurement');

        $this->withServerVariables(['HTTP_HOST' => 'procurement.'.config('app.system_domain')]);
        $this->actingAs($this->buyer);
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Yiwu Home Goods Co.',
            'country' => 'China',
            'city' => 'Yiwu',
            'currency' => 'CNY',
            'contacts' => [['name' => 'Li Wei', 'role' => 'Sales', 'phone' => '+86 138 0000 0000', 'email' => 'li@example.com']],
            'default_payment_terms' => 'immediate',
            'default_payment_days' => null,
            'is_active' => true,
        ];
    }

    #[Test]
    public function procurement_adds_and_edits_a_supplier(): void
    {
        $this->post(route('procurement.suppliers.store'), $this->payload())
            ->assertRedirect(route('procurement.suppliers.index'));

        $supplier = Supplier::query()->sole();
        $this->assertSame('CNY', $supplier->currency);
        $this->assertSame('Li Wei', $supplier->contacts[0]['name']);
        $this->assertSame($this->buyer->id, (int) $supplier->created_by);

        $this->put(route('procurement.suppliers.update', $supplier), $this->payload(['default_payment_terms' => 'fixed_date', 'default_payment_days' => 90]))
            ->assertSessionHasNoErrors();

        $this->assertSame(90, $supplier->refresh()->default_payment_days);

        $this->get(route('procurement.suppliers.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/Suppliers/Index')->where('suppliers.0.name', 'Yiwu Home Goods Co.'));
        $this->get(route('procurement.suppliers.edit', $supplier))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/Suppliers/Form')->where('supplier.id', $supplier->id));
    }

    #[Test]
    public function fixed_date_terms_need_the_number_of_days(): void
    {
        $this->post(route('procurement.suppliers.store'), $this->payload(['default_payment_terms' => 'fixed_date']))
            ->assertSessionHasErrors('default_payment_days');

        $this->post(route('procurement.suppliers.store'), $this->payload(['currency' => 'XXX']))
            ->assertSessionHasErrors('currency');
    }

    #[Test]
    public function a_supplier_with_orders_is_deactivated_not_removed(): void
    {
        $used = Supplier::factory()->create();
        Purchase::query()->create(['reference_number' => 'PO-T-1', 'supplier_id' => $used->id, 'supplier_name' => $used->name, 'status' => 'draft']);
        $unused = Supplier::factory()->create();

        $this->delete(route('procurement.suppliers.destroy', $used))->assertSessionHas('success');
        $this->delete(route('procurement.suppliers.destroy', $unused))->assertSessionHas('success');

        $this->assertFalse($used->refresh()->is_active);
        $this->assertSoftDeleted($unused);
    }
}
