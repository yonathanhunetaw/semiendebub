<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Session list + lifetime controls, mounted on both dev. and admin.
 */
class SessionManagementTest extends TestCase
{
    use RefreshDatabase;

    private function userWithRole(string $role): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now()]);
        $user->assignRole($role);

        return $user;
    }

    private function host(string $sub): string
    {
        return "http://{$sub}.".config('app.system_domain');
    }

    private function seedSession(string $id, ?int $userId = null, ?int $custom = null): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $userId,
            'ip_address' => '10.0.0.1',
            'user_agent' => 'Mozilla/5.0 (Macintosh; Mac OS X) Chrome/120.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->subMinutes(5)->timestamp,
            'custom_lifetime' => $custom,
        ]);
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function mounts(): array
    {
        return [
            'dev' => ['dev', 'dev', 'Dev/Sessions/index'],
            'admin' => ['admin', 'admin', 'Admin/Sessions/index'],
        ];
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('mounts')]
    public function the_list_reports_lifetimes_and_custom_overrides(string $sub, string $role, string $component): void
    {
        $this->seedSession('abc', null, 90);

        $this->actingAs($this->userWithRole($role))
            ->get($this->host($sub).'/sessions')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component($component)
                ->has('lifetimes.default')
                ->has('lifetimes.remember')
                ->where('sessions', fn ($rows) => collect($rows)->contains(
                    fn ($row) => $row['id'] === 'abc' && $row['lifetime_minutes'] === 90 && $row['has_custom_lifetime'] === true
                )));
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('mounts')]
    public function extend_sets_a_custom_lifetime_and_reset_clears_it(string $sub, string $role): void
    {
        $this->seedSession('abc');
        $user = $this->userWithRole($role);
        $base = $this->host($sub).'/sessions';

        $this->actingAs($user)->post("{$base}/abc/extend", ['minutes' => 1440])->assertSessionHas('success');
        $this->assertSame(1440, (int) DB::table('sessions')->where('id', 'abc')->value('custom_lifetime'));

        $this->actingAs($user)->post("{$base}/abc/reset")->assertSessionHas('success');
        $this->assertNull(DB::table('sessions')->where('id', 'abc')->value('custom_lifetime'));
    }

    #[Test]
    public function extend_rejects_absurd_durations(): void
    {
        $this->seedSession('abc');

        $this->actingAs($this->userWithRole('dev'))
            ->post($this->host('dev').'/sessions/abc/extend', ['minutes' => 99999999])
            ->assertSessionHasErrors('minutes');
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('mounts')]
    public function bulk_actions_work_on_selected_and_all(string $sub, string $role): void
    {
        $this->seedSession('a');
        $this->seedSession('b');
        $this->seedSession('c');
        $user = $this->userWithRole($role);
        $base = $this->host($sub).'/sessions';

        $this->actingAs($user)->post("{$base}/extend-selected", ['ids' => ['a', 'b'], 'minutes' => 60])->assertSessionHas('success');
        $this->assertSame(60, (int) DB::table('sessions')->where('id', 'a')->value('custom_lifetime'));
        $this->assertNull(DB::table('sessions')->where('id', 'c')->value('custom_lifetime'));

        $this->actingAs($user)->post("{$base}/extend-all", ['minutes' => 30])->assertSessionHas('success');
        $this->assertSame(30, (int) DB::table('sessions')->where('id', 'c')->value('custom_lifetime'));

        $this->actingAs($user)->deleteJson("{$base}/terminate-selected", ['ids' => ['a']]);
        $this->assertNull(DB::table('sessions')->where('id', 'a')->first());
        $this->assertNotNull(DB::table('sessions')->where('id', 'b')->first());

        $this->actingAs($user)->delete("{$base}/terminate-all")->assertSessionHas('success');
        $this->assertSame(0, DB::table('sessions')->whereIn('id', ['b', 'c'])->count());
    }

    #[Test]
    #[\PHPUnit\Framework\Attributes\DataProvider('mounts')]
    public function a_users_sessions_can_all_be_terminated_at_once(string $sub, string $role): void
    {
        $victim = $this->userWithRole('seller');
        $this->seedSession('v1', $victim->id);
        $this->seedSession('v2', $victim->id);
        $this->seedSession('other');

        $this->actingAs($this->userWithRole($role))
            ->delete($this->host($sub)."/sessions/users/{$victim->id}")
            ->assertSessionHas('success');

        $this->assertSame(0, DB::table('sessions')->where('user_id', $victim->id)->count());
        $this->assertNotNull(DB::table('sessions')->where('id', 'other')->first());
    }
}
