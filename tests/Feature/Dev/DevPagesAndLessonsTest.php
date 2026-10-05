<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Auth\User;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The Dev workspace pages the other Dev tests skip: dashboard, shipments,
 * design system, the lesson pages and the Lesson 6 demo resource.
 */
class DevPagesAndLessonsTest extends TestCase
{
    use RefreshDatabase;

    private function host(): string
    {
        return 'dev.'.config('app.system_domain');
    }

    private function signIn(): User
    {
        Role::findOrCreate('dev');
        $user = User::factory()->create(['role' => 'dev', 'email_verified_at' => now()]);
        $user->assignRole('dev');

        $this->withServerVariables(['HTTP_HOST' => $this->host()]);
        $this->actingAs($user);

        return $user;
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function pages(): array
    {
        return [
            'dashboard' => ['dev.dashboard', 'Dev/Dashboard/index'],
            'shipments' => ['dev.shipments.index', 'Dev/Shipments/index'],
            'design system' => ['dev.design-system.index', 'Dev/DesignSystem/index'],
            'lesson 4' => ['dev.lesson4.index', 'Dev/Lessons/Lesson4/index'],
            'lesson 7' => ['dev.lesson7.index', 'Dev/Lessons/Lesson7/Index'],
            'lesson 6 create' => ['dev.lesson6.create', 'Dev/Lessons/Lesson6/CreateColor'],
        ];
    }

    #[Test]
    #[DataProvider('pages')]
    public function each_page_opens_for_a_dev_user(string $route, string $component): void
    {
        $this->signIn();

        $this->get(route($route))->assertOk()
            ->assertInertia(fn ($page) => $page->component($component));
    }

    #[Test]
    #[DataProvider('pages')]
    public function each_page_is_closed_to_guests(string $route): void
    {
        $this->withServerVariables(['HTTP_HOST' => $this->host()]);

        $this->get(route($route))->assertRedirect(route('dev.login'));
    }

    #[Test]
    public function the_design_system_page_does_not_exist_outside_development(): void
    {
        $this->signIn();
        app()->detectEnvironment(fn (): string => 'production');

        $this->get(route('dev.design-system.index'))->assertNotFound();
    }

    // ---- Lesson 6 demo resource -------------------------------------------

    #[Test]
    public function the_lesson_6_list_hands_the_page_its_colours_with_image_links(): void
    {
        $this->signIn();
        Storage::fake('s3');
        Storage::disk('s3')->buildTemporaryUrlsUsing(fn (string $path) => "https://files.test/{$path}");

        $this->get(route('dev.lesson6.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Dev/Dashboard/Lesson6/Index')
                ->has('initialColors', 3)
                ->where('initialColors.0.image_url', 'https://files.test/3X3_blue_1.jpg'));
    }

    #[Test]
    public function the_lesson_6_show_and_edit_pages_receive_the_colour_id(): void
    {
        $this->signIn();

        $this->get(route('dev.lesson6.show', 'abc'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Dev/Lessons/Lesson6/ShowColor')->where('color', 'abc'));
        $this->get(route('dev.lesson6.edit', 'abc'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Dev/Lessons/Lesson6/EditColor')->where('color', 'abc'));
    }

    #[Test]
    public function a_lesson_6_colour_update_checks_its_rating_and_title(): void
    {
        $this->signIn();

        $this->put(route('dev.lesson6.update', 'abc'), ['rating' => 3, 'title' => 'lawn'])->assertSessionHasNoErrors();
        $this->put(route('dev.lesson6.update', 'abc'), ['rating' => 6])->assertSessionHasErrors('rating');
        $this->put(route('dev.lesson6.update', 'abc'), ['rating' => -1])->assertSessionHasErrors('rating');
        $this->put(route('dev.lesson6.update', 'abc'), ['rating' => 'five'])->assertSessionHasErrors('rating');
    }

    #[Test]
    public function a_lesson_6_colour_can_be_removed(): void
    {
        $this->signIn();

        $this->delete(route('dev.lesson6.destroy', 'abc'))->assertSessionHas('message', 'Color removed.');
    }

    #[Test]
    public function adding_a_lesson_6_colour_redirects_with_a_success_message(): void
    {
        $this->signIn();

        $this->post(route('dev.lesson6.store'), ['title' => 'sky'])
            ->assertRedirect()
            ->assertSessionHas('success', 'Color added successfully!');
    }
}
