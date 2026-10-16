<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Admin → Settings → Sessions and the admin's own session: it is marked
 * current, ending it signs the admin out, and a bulk end never includes it.
 * Remember-me sessions get the longer lifetime.
 */
class AdminOwnSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private string $mine;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $this->admin->assignRole('admin');

        // A browser sends its session cookie; pin it so the request's session is a stored row.
        $this->mine = str_repeat('m', 40);
        $this->storeSession($this->mine, $this->admin->id);
        $this->withCookie(config('session.cookie'), $this->mine);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($this->admin);
    }

    private function storeSession(string $id, ?int $userId, array $payload = []): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $userId, 'ip_address' => '10.0.0.1', 'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize($payload)), 'last_activity' => now()->subMinute()->timestamp,
        ]);
    }

    #[Test]
    public function the_list_marks_the_current_session_and_gives_remember_me_the_long_lifetime(): void
    {
        $this->storeSession('remembered', null, ['login_web_59ba36addc2b2f9401580f014c7f58ea4e30989d_remember_x' => 1]);

        $this->get(route('admin.sessions.index'))->assertOk()
            ->assertInertia(function ($page) {
                $rows = collect($page->toArray()['props']['sessions'])->keyBy('id');

                $this->assertTrue($rows[$this->mine]['is_current']);
                $this->assertTrue($rows[$this->mine]['is_live']);
                $this->assertFalse($rows['remembered']['is_current']);
                $this->assertTrue($rows['remembered']['remember_me']);
                $this->assertSame(8640, $rows['remembered']['lifetime_minutes']);
                $this->assertSame('Visitor', $rows['remembered']['user']['first_name']);
            });
    }

    #[Test]
    public function ending_your_own_session_signs_you_out(): void
    {
        $this->delete(route('admin.sessions.destroy', $this->mine))->assertRedirect(route('login'));

        $this->assertGuest();
        $this->assertSame(0, DB::table('sessions')->where('id', $this->mine)->count());
    }

    #[Test]
    public function ending_a_session_that_is_gone_says_so(): void
    {
        $this->delete(route('admin.sessions.destroy', 'nope'))->assertSessionHas('error', 'Session not found.');
    }

    #[Test]
    public function a_bulk_end_skips_your_own_session(): void
    {
        $this->storeSession('other', null);

        $this->delete(route('admin.sessions.destroySelected'), ['ids' => [$this->mine]])
            ->assertSessionHas('error', 'Your current session cannot be terminated from a bulk action.');

        $this->delete(route('admin.sessions.destroySelected'), ['ids' => [$this->mine, 'other']])
            ->assertSessionHas('success', '1 session(s) terminated successfully.');

        $this->assertSame([$this->mine], DB::table('sessions')->pluck('id')->all());
        $this->assertAuthenticated();
    }
}
