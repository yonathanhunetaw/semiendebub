<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Extensions\CustomDatabaseSessionHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Session;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The database session handler honours a per-session lifetime
 * (sessions.custom_lifetime, in minutes) both when reading a session and when
 * sweeping old ones; without one it falls back to the app's lifetime.
 */
class CustomSessionLifetimeTest extends TestCase
{
    use RefreshDatabase;

    private function handler(int $minutes = 120): CustomDatabaseSessionHandler
    {
        return new CustomDatabaseSessionHandler(DB::connection(), 'sessions', $minutes, $this->app);
    }

    private function row(string $id, int $idleMinutes, ?int $customLifetime): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => null, 'ip_address' => null, 'user_agent' => null,
            'payload' => base64_encode('data-'.$id), 'last_activity' => now()->subMinutes($idleMinutes)->timestamp,
            'custom_lifetime' => $customLifetime,
        ]);
    }

    #[Test]
    public function the_app_registers_this_handler_for_the_database_driver(): void
    {
        config(['session.driver' => 'database']);

        $this->assertInstanceOf(CustomDatabaseSessionHandler::class, Session::driver('database')->getHandler());
    }

    #[Test]
    public function a_session_reads_until_its_own_lifetime_runs_out(): void
    {
        $this->row('short', 30, 15);   // 15-minute session, idle 30: expired
        $this->row('long', 300, 600);  // 10-hour session, idle 5 h: alive
        $this->row('plain', 60, null); // app default 120: alive
        $this->row('stale', 180, null);

        $handler = $this->handler();

        $this->assertSame('', $handler->read('short'));
        $this->assertSame('data-long', $handler->read('long'));
        $this->assertSame('data-plain', $handler->read('plain'));
        $this->assertSame('', $handler->read('stale'));
    }

    #[Test]
    public function the_sweep_removes_each_session_by_its_own_lifetime(): void
    {
        $this->row('short', 30, 15);
        $this->row('long', 300, 600);
        $this->row('plain', 60, null);
        $this->row('stale', 180, null);

        $deleted = $this->handler()->gc(120 * 60);

        $this->assertSame(2, $deleted);
        $this->assertEqualsCanonicalizing(['long', 'plain'], DB::table('sessions')->pluck('id')->all());
    }
}
