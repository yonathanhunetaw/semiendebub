<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Customers, Users (update/delete) and Sessions: the write actions. */
class AdminCustomerUserSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    // ---- Customers ---------------------------------------------------------

    #[Test]
    public function the_customer_list_opens(): void
    {
        $this->get(route('admin.customers.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Customers/Index'));
    }

    #[Test]
    public function an_admin_creates_a_customer_and_the_city_is_title_cased(): void
    {
        $this->post(route('admin.customers.store'), [
            'first_name' => 'Abebe', 'last_name' => 'K', 'email' => 'abebe@example.com',
            'phone_number' => '0911000001', 'city' => 'addis ababa', 'tin_number' => '1234567890',
        ])->assertSessionHasNoErrors()->assertSessionHas('success');

        $customer = Customer::query()->where('email', 'abebe@example.com')->sole();
        $this->assertSame('Addis Ababa', $customer->city);
        $this->assertSame($this->admin->id, (int) $customer->created_by);
    }

    #[Test]
    public function a_customer_needs_a_name_email_and_phone_and_they_must_be_unique(): void
    {
        $this->post(route('admin.customers.store'), [])
            ->assertSessionHasErrors(['first_name', 'email', 'phone_number']);

        Customer::query()->create([
            'first_name' => 'Taken', 'email' => 'taken@example.com', 'phone_number' => '0911000002',
            'created_by' => $this->admin->id,
        ]);

        $this->post(route('admin.customers.store'), [
            'first_name' => 'Dup', 'email' => 'taken@example.com', 'phone_number' => '0911000002',
        ])->assertSessionHasErrors(['email', 'phone_number']);

        $this->assertSame(1, Customer::query()->count());
    }

    #[Test]
    public function an_admin_updates_a_customer_and_may_keep_their_own_email(): void
    {
        $customer = Customer::query()->create([
            'first_name' => 'Old', 'email' => 'old@example.com', 'phone_number' => '0911000003',
            'created_by' => $this->admin->id,
        ]);

        $this->put(route('admin.customers.update', $customer->id), [
            'first_name' => 'New', 'email' => 'old@example.com', 'phone_number' => '0911000003', 'city' => 'adama',
        ])->assertSessionHasNoErrors();

        $customer->refresh();
        $this->assertSame('New', $customer->first_name);
        $this->assertSame('Adama', $customer->city);
    }

    #[Test]
    public function a_customer_cannot_take_another_customers_email(): void
    {
        Customer::query()->create(['first_name' => 'A', 'email' => 'a@example.com', 'phone_number' => '0911000004', 'created_by' => $this->admin->id]);
        $b = Customer::query()->create(['first_name' => 'B', 'email' => 'b@example.com', 'phone_number' => '0911000005', 'created_by' => $this->admin->id]);

        $this->put(route('admin.customers.update', $b->id), [
            'first_name' => 'B', 'email' => 'a@example.com', 'phone_number' => '0911000005',
        ])->assertSessionHasErrors('email');
    }

    #[Test]
    public function an_admin_deletes_a_customer(): void
    {
        $customer = Customer::query()->create(['first_name' => 'Gone', 'email' => 'gone@example.com', 'phone_number' => '0911000006', 'created_by' => $this->admin->id]);

        $this->delete(route('admin.customers.destroy', $customer->id))->assertSessionHas('success');

        $this->assertNull(Customer::query()->find($customer->id));
    }

    #[Test]
    public function updating_or_deleting_a_missing_customer_is_a_404(): void
    {
        $this->delete(route('admin.customers.destroy', 999999))->assertNotFound();
    }

    // ---- Users -------------------------------------------------------------

    #[Test]
    public function the_user_list_and_detail_pages_open(): void
    {
        $user = User::factory()->create(['role' => 'seller']);

        $this->get(route('admin.users.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Users/Index'));
        $this->get(route('admin.users.show', $user))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Users/Show')->where('user.id', $user->id));
        $this->get(route('admin.users.create'))->assertOk();
    }

    #[Test]
    public function a_user_needs_valid_details_a_known_role_and_a_confirmed_password(): void
    {
        $this->post(route('admin.users.store'), [
            'first_name' => 'X', 'email' => 'not-an-email', 'role' => 'wizard',
            'password' => 'short', 'password_confirmation' => 'different',
        ])->assertSessionHasErrors(['email', 'role', 'password']);

        $this->assertSame(1, User::query()->count());
    }

    #[Test]
    public function a_user_email_must_be_unique(): void
    {
        User::factory()->create(['email' => 'dup@example.com']);

        $this->post(route('admin.users.store'), [
            'first_name' => 'X', 'email' => 'dup@example.com', 'role' => 'seller',
            'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
        ])->assertSessionHasErrors('email');
    }

    #[Test]
    public function an_admin_updates_a_user_and_the_password_changes_only_when_given(): void
    {
        $user = User::factory()->create(['role' => 'seller', 'email' => 'u@example.com']);
        $user->assignRole('seller');
        $before = $user->password;

        $this->put(route('admin.users.update', $user), [
            'first_name' => 'Renamed', 'email' => 'u@example.com', 'role' => 'seller',
        ])->assertSessionHasNoErrors();

        $user->refresh();
        $this->assertSame('Renamed', $user->first_name);
        $this->assertSame($before, $user->password);

        $this->put(route('admin.users.update', $user), [
            'first_name' => 'Renamed', 'email' => 'u@example.com', 'role' => 'seller',
            'password' => 'brand-new-pass', 'password_confirmation' => 'brand-new-pass',
        ])->assertSessionHasNoErrors();

        $this->assertNotSame($before, $user->refresh()->password);
    }

    #[Test]
    public function a_new_password_must_be_confirmed(): void
    {
        $user = User::factory()->create(['role' => 'seller', 'email' => 'u2@example.com']);
        $user->assignRole('seller');

        $this->put(route('admin.users.update', $user), [
            'first_name' => 'U', 'email' => 'u2@example.com', 'role' => 'seller',
            'password' => 'brand-new-pass', 'password_confirmation' => 'nope',
        ])->assertSessionHasErrors('password');
    }

    #[Test]
    public function an_admin_deletes_a_user(): void
    {
        $user = User::factory()->create(['role' => 'seller']);

        $this->delete(route('admin.users.destroy', $user))->assertRedirect(route('admin.users.index'));

        $this->assertNull(User::query()->find($user->id));
    }

    // ---- Sessions ----------------------------------------------------------

    private function seedSession(string $id, ?int $userId = null, ?int $customLifetime = null): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $userId, 'ip_address' => '10.0.0.1', 'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])), 'last_activity' => now()->subHour()->timestamp,
            'custom_lifetime' => $customLifetime,
        ]);
    }

    #[Test]
    public function the_session_list_shows_users_and_visitors(): void
    {
        $user = User::factory()->create(['role' => 'seller']);
        $this->seedSession('s-user', $user->id);
        $this->seedSession('s-guest');

        $this->get(route('admin.sessions.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Sessions/index')
                ->where('sessions', fn ($rows) => collect($rows)->pluck('user.first_name')->contains('Visitor')
                    && collect($rows)->pluck('user.id')->contains($user->id)));
    }

    #[Test]
    public function an_admin_extends_one_session_and_resets_it_to_the_default(): void
    {
        $this->seedSession('s-one');

        $this->post(route('admin.sessions.extend', 's-one'), ['minutes' => 600])->assertSessionHas('success');
        $row = DB::table('sessions')->where('id', 's-one')->first();
        $this->assertSame(600, (int) $row->custom_lifetime);
        $this->assertGreaterThan(now()->subMinute()->timestamp, (int) $row->last_activity);

        $this->post(route('admin.sessions.reset', 's-one'))->assertSessionHas('success');
        $this->assertNull(DB::table('sessions')->where('id', 's-one')->value('custom_lifetime'));
    }

    #[Test]
    public function extending_needs_a_sensible_number_of_minutes(): void
    {
        $this->seedSession('s-one');

        $this->post(route('admin.sessions.extend', 's-one'), ['minutes' => 0])->assertSessionHasErrors('minutes');
        $this->post(route('admin.sessions.extend', 's-one'), ['minutes' => 525601])->assertSessionHasErrors('minutes');
        $this->post(route('admin.sessions.extend', 's-one'), [])->assertSessionHasErrors('minutes');
    }

    #[Test]
    public function an_unknown_session_reports_an_error_rather_than_failing(): void
    {
        $this->post(route('admin.sessions.extend', 'nope'), ['minutes' => 10])->assertSessionHas('error');
        $this->post(route('admin.sessions.reset', 'nope'))->assertSessionHas('error');
        $this->delete(route('admin.sessions.destroy', 'nope'))->assertSessionHas('error');
    }

    #[Test]
    public function an_admin_terminates_a_single_session(): void
    {
        $this->seedSession('s-one');
        $this->seedSession('s-two');

        $this->delete(route('admin.sessions.destroy', 's-one'))->assertSessionHas('success');

        $this->assertDatabaseMissing('sessions', ['id' => 's-one']);
        $this->assertDatabaseHas('sessions', ['id' => 's-two']);
    }

    #[Test]
    public function extend_all_and_extend_selected_touch_the_right_sessions(): void
    {
        $this->seedSession('a');
        $this->seedSession('b');

        $this->post(route('admin.sessions.extendSelected'), ['minutes' => 30, 'ids' => ['a']])->assertSessionHas('success');
        $this->assertSame(30, (int) DB::table('sessions')->where('id', 'a')->value('custom_lifetime'));
        $this->assertNull(DB::table('sessions')->where('id', 'b')->value('custom_lifetime'));

        $this->post(route('admin.sessions.extendSelected'), ['minutes' => 30])->assertSessionHas('error');

        $this->post(route('admin.sessions.extendAll'), ['minutes' => 90])->assertSessionHas('success');
        $this->assertSame(0, DB::table('sessions')->where('custom_lifetime', '!=', 90)->count());
    }

    #[Test]
    public function terminating_selected_sessions_deletes_only_those(): void
    {
        $this->seedSession('a');
        $this->seedSession('b');
        $this->seedSession('c');

        $this->delete(route('admin.sessions.destroySelected'), ['ids' => ['a', 'b']])->assertSessionHas('success');

        $this->assertSame(['c'], DB::table('sessions')->pluck('id')->all());
        $this->delete(route('admin.sessions.destroySelected'), [])->assertSessionHasErrors('ids');
    }

    #[Test]
    public function terminate_all_and_terminate_a_users_sessions_clear_the_others(): void
    {
        $user = User::factory()->create(['role' => 'seller']);
        $this->seedSession('u1', $user->id);
        $this->seedSession('u2', $user->id);
        $this->seedSession('other');

        $this->delete(route('admin.sessions.destroyUser', $user->id))->assertSessionHas('success');
        $this->assertSame(['other'], DB::table('sessions')->pluck('id')->all());

        $this->seedSession('x');
        $this->delete(route('admin.sessions.destroyAll'))->assertSessionHas('success');
        $this->assertSame(0, DB::table('sessions')->count());
    }
}
