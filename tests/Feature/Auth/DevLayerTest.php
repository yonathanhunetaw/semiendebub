<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Dev rides on top of a global admin: only that person sees the hidden (demo)
 * users and anyone holding dev. Other global admins do not.
 */
class DevLayerTest extends TestCase
{
    use RefreshDatabase;

    private string $host;

    protected function setUp(): void
    {
        parent::setUp();
        $this->host = 'http://admin.'.config('app.system_domain');
    }

    private function user(string $role, array $also = [], bool $hidden = false, ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'is_hidden' => $hidden]);
        $user->syncRoles([$role, ...$also]);

        return $user->fresh();
    }

    private function listed(User $viewer): array
    {
        return collect($this->actingAs($viewer)->get("{$this->host}/users")->assertOk()->viewData('page')['props']['users'])->pluck('id')->all();
    }

    #[Test]
    public function other_global_admins_do_not_see_hidden_users_or_the_dev_admin(): void
    {
        $plain = $this->user('admin');
        $dev = $this->user('admin', ['dev']);
        $demo = $this->user('seller', [], true);
        $visible = $this->user('seller');

        $ids = $this->listed($plain);

        $this->assertContains($visible->id, $ids);
        $this->assertNotContains($demo->id, $ids);
        $this->assertNotContains($dev->id, $ids);
    }

    #[Test]
    public function the_global_admin_with_dev_sees_everyone(): void
    {
        $dev = $this->user('admin', ['dev']);
        $plain = $this->user('admin');
        $demo = $this->user('seller', [], true);

        $ids = $this->listed($dev);

        $this->assertEqualsCanonicalizing([$dev->id, $plain->id, $demo->id], array_intersect([$dev->id, $plain->id, $demo->id], $ids));
    }

    #[Test]
    public function a_hidden_user_is_not_found_by_anyone_outside_the_dev_layer(): void
    {
        $plain = $this->user('admin');
        $dev = $this->user('admin', ['dev']);
        $demo = $this->user('seller', [], true);

        $this->actingAs($plain)->get("{$this->host}/users/{$demo->id}")->assertNotFound();
        $this->actingAs($plain)->get("{$this->host}/users/{$dev->id}/edit")->assertNotFound();
        $this->actingAs($plain)->delete("{$this->host}/users/{$demo->id}")->assertNotFound();
        $this->actingAs($dev)->get("{$this->host}/users/{$demo->id}")->assertOk();
    }

    #[Test]
    public function only_the_dev_layer_can_hide_a_user_or_tick_dev(): void
    {
        $plain = $this->user('admin');
        $dev = $this->user('admin', ['dev']);
        $payload = ['first_name' => 'Demo', 'role' => 'seller', 'password' => 'password1', 'password_confirmation' => 'password1'];

        // A plain global admin: the hidden flag is ignored and dev is not on offer.
        $this->actingAs($plain)->post("{$this->host}/users", $payload + ['email' => 'a@example.test', 'is_hidden' => true])->assertRedirect();
        $this->assertFalse(User::where('email', 'a@example.test')->firstOrFail()->is_hidden);
        $this->actingAs($plain)->post("{$this->host}/users", array_merge($payload, ['email' => 'b@example.test', 'role' => 'admin', 'also_roles' => ['dev']]))->assertSessionHasErrors('also_roles.0');

        // The dev layer can.
        $this->actingAs($dev)->post("{$this->host}/users", $payload + ['email' => 'c@example.test', 'is_hidden' => true])->assertSessionHasNoErrors()->assertRedirect();
        $this->assertTrue(User::where('email', 'c@example.test')->firstOrFail()->is_hidden);
        $this->actingAs($dev)->post("{$this->host}/users", array_merge($payload, ['email' => 'd@example.test', 'role' => 'admin', 'also_roles' => ['dev']]))->assertSessionHasNoErrors()->assertRedirect();
        $this->assertTrue(User::where('email', 'd@example.test')->firstOrFail()->hasRole('dev'));
    }

    #[Test]
    public function dev_only_sits_on_a_global_admin(): void
    {
        $dev = $this->user('admin', ['dev']);
        $store = Store::factory()->create()->id;
        $payload = ['first_name' => 'X', 'password' => 'password1', 'password_confirmation' => 'password1', 'also_roles' => ['dev']];

        $this->actingAs($dev)->post("{$this->host}/users", array_merge($payload, ['email' => 'e@example.test', 'role' => 'admin', 'store_id' => $store]))->assertSessionHasErrors('also_roles');
        $this->actingAs($dev)->post("{$this->host}/users", array_merge($payload, ['email' => 'f@example.test', 'role' => 'seller']))->assertSessionHasErrors('also_roles');
    }

    #[Test]
    public function the_apps_menu_hides_hidden_users_from_other_global_admins(): void
    {
        $plain = $this->user('admin');
        $dev = $this->user('admin', ['dev']);
        $demo = $this->user('seller', [], true);
        $visible = $this->user('seller');

        $seenByPlain = collect($this->actingAs($plain)->getJson("{$this->host}/impersonate/users")->json('people'))->pluck('id')->all();
        $seenByDev = collect($this->actingAs($dev)->getJson("{$this->host}/impersonate/users")->json('people'))->pluck('id')->all();

        $this->assertContains($visible->id, $seenByPlain);
        $this->assertNotContains($demo->id, $seenByPlain);
        $this->assertContains($demo->id, $seenByDev);

        $this->actingAs($plain)->post("{$this->host}/impersonate", ['user_id' => $demo->id])->assertForbidden();
    }

    #[Test]
    public function sessions_of_hidden_users_are_listed_only_for_the_dev_layer(): void
    {
        $plain = $this->user('admin');
        $dev = $this->user('admin', ['dev']);
        $demo = $this->user('seller', [], true);
        $visible = $this->user('seller');

        foreach ([$demo, $visible] as $who) {
            \Illuminate\Support\Facades\DB::table('sessions')->insert([
                'id' => 'sess-'.$who->id, 'user_id' => $who->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'x',
                'payload' => base64_encode(serialize([])), 'last_activity' => time(),
            ]);
        }

        $idsFor = fn (User $viewer) => collect($this->actingAs($viewer)->get("{$this->host}/sessions")->assertOk()->viewData('page')['props']['sessions'] ?? [])
            ->map(fn ($row) => $row['user_id'] ?? $row['user']['id'] ?? null)->all();

        $plainSees = $idsFor($plain);
        $devSees = $idsFor($dev);

        $this->assertNotContains($demo->id, $plainSees);
        $this->assertContains($demo->id, $devSees);
    }

    #[Test]
    public function a_hidden_user_still_sees_themself_but_not_other_hidden_users(): void
    {
        $demo = $this->user('seller', [], true);
        $otherDemo = $this->user('seller', [], true);
        $visible = $this->user('seller');

        $ids = User::query()->visibleTo($demo)->pluck('id')->all();

        $this->assertContains($demo->id, $ids);
        $this->assertContains($visible->id, $ids);
        $this->assertNotContains($otherDemo->id, $ids);
        $this->assertFalse($demo->isHiddenFrom($demo));
    }

    #[Test]
    public function the_admin_seller_pickers_leave_hidden_users_out(): void
    {
        $plain = $this->user('admin');
        $dev = $this->user('admin', ['dev']);
        $store = Store::factory()->create();
        $demo = $this->user('seller', [], true, $store->id);
        $visible = $this->user('seller', [], false, $store->id);

        $names = fn (User $viewer) => collect($this->actingAs($viewer)->get("{$this->host}/carts/create")->assertOk()->viewData('page')['props']['sellers'] ?? [])->pluck('id')->all();

        $this->assertContains($visible->id, $names($plain));
        $this->assertNotContains($demo->id, $names($plain));
        $this->assertContains($demo->id, $names($dev));
    }
}
