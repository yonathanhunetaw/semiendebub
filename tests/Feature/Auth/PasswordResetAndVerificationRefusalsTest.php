<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Auth\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The refusals around password resets and email verification: an unknown
 * email, a bad reset token, and re-sending a verification link.
 */
class PasswordResetAndVerificationRefusalsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function a_reset_link_for_an_unknown_email_is_refused_without_sending_anything(): void
    {
        Notification::fake();

        $this->post('/forgot-password', ['email' => 'nobody@duka.test'])
            ->assertSessionHasErrors(['email' => trans('passwords.user')]);

        Notification::assertNothingSent();
    }

    #[Test]
    public function a_bad_reset_token_leaves_the_password_alone(): void
    {
        $user = User::factory()->create(['password' => Hash::make('old-password')]);

        $this->post('/reset-password', [
            'token' => 'not-a-real-token', 'email' => $user->email,
            'password' => 'new-password-123', 'password_confirmation' => 'new-password-123',
        ])->assertSessionHasErrors(['email' => trans('passwords.token')]);

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    #[Test]
    public function an_unverified_user_can_ask_for_another_verification_link(): void
    {
        Notification::fake();
        $user = User::factory()->unverified()->create();

        $this->actingAs($user)->post(route('verification.send'))
            ->assertSessionHas('status', 'verification-link-sent');

        Notification::assertSentTo($user, VerifyEmail::class);
    }

    #[Test]
    public function a_verified_user_asking_again_is_sent_on_without_an_email(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email_verified_at' => now()]);

        $this->actingAs($user)->post(route('verification.send'))
            ->assertRedirect(route('dashboard', absolute: false));

        Notification::assertNothingSent();
    }
}
