<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Five wrong passwords lock an email out for a while, even from the right
 * password; and the shared root pages on a role subdomain (guest.subdomain)
 * are only for that subdomain's role.
 */
class LoginThrottleAndGuestPagesTest extends TestCase
{
    use RefreshDatabase;

    private function courier(): User
    {
        $user = User::factory()->create(['role' => 'delivery', 'email' => 'runner@duka.test', 'password' => bcrypt('right-password'), 'email_verified_at' => now()]);
        $user->assignRole('delivery');

        return $user->refresh();
    }

    private function host(string $app): string
    {
        return 'http://'.$app.'.'.config('app.system_domain');
    }

    #[Test]
    public function five_wrong_passwords_lock_the_email_out_even_from_the_right_one(): void
    {
        Event::fake([Lockout::class]);
        $this->freezeTime();
        $this->courier();

        foreach (range(1, 5) as $attempt) {
            $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'wrong'])
                ->assertSessionHasErrors('email');
        }
        Event::assertNotDispatched(Lockout::class);

        $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'right-password'])
            ->assertSessionHasErrors(['email' => trans('auth.throttle', ['seconds' => 60, 'minutes' => 1])]);

        $this->assertGuest();
        Event::assertDispatched(Lockout::class);
    }

    #[Test]
    public function a_lockout_is_written_to_the_auth_log(): void
    {
        $this->courier();
        config(['logging.channels.auth' => ['driver' => 'monolog', 'handler' => \Monolog\Handler\TestHandler::class]]);
        \Illuminate\Support\Facades\Log::forgetChannel('auth');

        foreach (range(1, 6) as $attempt) {
            $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'wrong']);
        }

        /** @var \Monolog\Handler\TestHandler $handler */
        $handler = \Illuminate\Support\Facades\Log::channel('auth')->getLogger()->getHandlers()[0];
        $this->assertTrue($handler->hasWarningThatContains('Auth lockout'));
        $lockout = collect($handler->getRecords())->first(fn ($r) => $r->message === 'Auth lockout');
        $this->assertSame('runner@duka.test', $lockout->context['email']);
        $this->assertSame('/login', $lockout->context['path']);
    }

    #[Test]
    public function a_good_login_clears_the_failed_attempts(): void
    {
        $this->courier();

        foreach (range(1, 4) as $attempt) {
            $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'wrong']);
        }
        $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'right-password'])
            ->assertSessionHasNoErrors();
        $this->assertAuthenticated();
        $this->post($this->host('delivery').'/logout');

        // Four more failures would have tripped the lock had the count not been reset.
        foreach (range(1, 4) as $attempt) {
            $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'wrong']);
        }
        $this->post($this->host('delivery').'/login', ['email' => 'runner@duka.test', 'password' => 'right-password'])
            ->assertSessionHasNoErrors();
    }

    #[Test]
    public function a_subdomains_shared_pages_are_for_its_own_role_only(): void
    {
        $courier = $this->courier();
        $seller = User::factory()->create(['role' => 'seller', 'email_verified_at' => now()]);
        $seller->assignRole('seller');

        $this->actingAs($seller->refresh())->get($this->host('delivery').'/about')
            ->assertRedirect($this->host('delivery').'/');

        $this->actingAs($courier)->get($this->host('delivery').'/about')->assertOk();
    }

    #[Test]
    public function on_the_root_domain_the_shared_pages_are_open_to_any_signed_in_user(): void
    {
        $seller = User::factory()->create(['role' => 'seller', 'email_verified_at' => now()]);
        $seller->assignRole('seller');

        $this->actingAs($seller->refresh())->get('http://'.config('app.system_domain').'/about')->assertOk();
    }
}
