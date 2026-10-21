<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Canvas\Canvas;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CanvasDeleteTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $user->assignRole('admin');

        return $user;
    }

    #[Test]
    public function the_owner_can_delete_their_canvas(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $owner = $this->admin();
        $canvas = Canvas::create(['user_id' => $owner->id, 'store_id' => Store::factory()->create(['type' => Store::TYPE_RETAIL])->id, 'title' => 'Plan']);

        $this->actingAs($owner)->delete(route('admin.canvas.destroy', $canvas->id))->assertRedirect();

        $this->assertDatabaseMissing('canvases', ['id' => $canvas->id]);
    }

    #[Test]
    public function someone_it_is_shared_with_cannot_delete_it(): void
    {
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $owner = $this->admin();
        $guest = $this->admin();
        $canvas = Canvas::create(['user_id' => $owner->id, 'store_id' => Store::factory()->create(['type' => Store::TYPE_RETAIL])->id, 'title' => 'Plan']);
        $canvas->shares()->attach($guest->id, ['permission' => 'edit']);

        $this->actingAs($guest)->delete(route('admin.canvas.destroy', $canvas->id))->assertForbidden();

        $this->assertDatabaseHas('canvases', ['id' => $canvas->id]);
    }
}
