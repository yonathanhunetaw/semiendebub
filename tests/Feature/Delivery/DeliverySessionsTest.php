<?php

declare(strict_types=1);

namespace Tests\Feature\Delivery;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Delivery → Sessions: a courier sees where they are signed in and can end
 * those sessions, and never anyone else's.
 */
class DeliverySessionsTest extends TestCase
{
    use RefreshDatabase;

    private User $courier;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->courier = $this->user();
        $this->other = $this->user();
        $this->withServerVariables(['HTTP_HOST' => 'delivery.'.config('app.system_domain')]);
    }

    private function user(): User
    {
        $user = User::factory()->create(['role' => 'delivery', 'email_verified_at' => now()]);
        $user->assignRole('delivery');

        return $user->refresh();
    }

    private function signedInAt(string $id, User $user, int $minutesAgo): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $user->id, 'ip_address' => '10.0.0.'.$minutesAgo,
            'user_agent' => 'Phone', 'payload' => '', 'last_activity' => now()->subMinutes($minutesAgo)->timestamp,
        ]);
    }

    #[Test]
    public function a_courier_sees_only_their_own_sessions_newest_first(): void
    {
        $this->signedInAt('old', $this->courier, 90);
        $this->signedInAt('new', $this->courier, 5);
        $this->signedInAt('theirs', $this->other, 1);

        $this->actingAs($this->courier)
            ->get(route('delivery.sessions.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Delivery/Sessions/index')
                ->has('sessions', 2)
                ->where('sessions.0.id', 'new')
                ->where('sessions.0.ip_address', '10.0.0.5')
                ->where('sessions.0.is_current_device', false)
                ->where('sessions.1.id', 'old'));
    }

    #[Test]
    public function a_courier_ends_their_own_session_but_not_someone_elses(): void
    {
        $this->signedInAt('mine', $this->courier, 5);
        $this->signedInAt('theirs', $this->other, 5);

        $this->actingAs($this->courier)->delete(route('delivery.sessions.destroy', 'mine'))->assertRedirect();
        $this->actingAs($this->courier)->delete(route('delivery.sessions.destroy', 'theirs'))->assertRedirect();

        $this->assertSame(['theirs'], DB::table('sessions')->pluck('id')->all());
    }
}
