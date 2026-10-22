<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Canvas\Canvas;
use App\Models\Canvas\CanvasGroup;
use App\Models\Canvas\CanvasVersion;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Items (create form, inline options, variant delete), Canvas, and the settings / welcome pages. */
class AdminItemCanvasPagesTest extends TestCase
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

    private function user(string $role = 'seller'): User
    {
        $user = User::factory()->create(['role' => $role]);
        $user->assignRole($role);

        return $user;
    }

    // ---- Items -------------------------------------------------------------

    #[Test]
    public function the_new_item_page_offers_the_categories(): void
    {
        ItemCategory::factory()->create(['category_name' => 'Pens']);

        $this->get(route('admin.items.create'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Items/New')
                ->has('categories', 1)
                ->where('categories.0.path', 'Pens'));
    }

    #[Test]
    public function an_option_can_be_added_inline_and_adding_it_twice_reuses_it(): void
    {
        foreach ([
            'category' => [ItemCategory::class, 'category_name'],
            'color' => [ItemColor::class, 'name'],
            'size' => [ItemSize::class, 'name'],
            'packaging' => [ItemPackagingType::class, 'name'],
        ] as $type => [$model, $column]) {
            $first = $this->postJson(route('admin.items.inline-options'), ['type' => $type, 'name' => '  Teal  '])
                ->assertOk()->assertJsonPath('name', 'Teal');
            $second = $this->postJson(route('admin.items.inline-options'), ['type' => $type, 'name' => 'Teal'])->assertOk();

            $this->assertSame($first->json('id'), $second->json('id'), "{$type} was duplicated");
            $this->assertSame(1, $model::query()->where($column, 'Teal')->count());
        }
    }

    #[Test]
    public function an_inline_option_needs_a_known_type_and_a_name(): void
    {
        $this->postJson(route('admin.items.inline-options'), ['type' => 'flavour', 'name' => 'Mint'])->assertJsonValidationErrors('type');
        $this->postJson(route('admin.items.inline-options'), ['type' => 'color'])->assertJsonValidationErrors('name');
    }

    #[Test]
    public function deleting_a_variant_deactivates_it_in_every_store_and_removes_it(): void
    {
        $store = Store::factory()->create();
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $keep = ItemVariant::factory()->create(['item_id' => $item->id]);
        $storeVariant = StoreVariant::factory()->create(['store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true]);

        $this->delete(route('admin.items.variants.destroy', [$item, $variant]))->assertSessionHas('success');

        $this->assertNull(ItemVariant::query()->find($variant->id));
        $this->assertNotNull(ItemVariant::query()->find($keep->id));
        $this->assertFalse((bool) $storeVariant->fresh()->active);
    }

    #[Test]
    public function a_variant_cannot_be_deleted_through_another_items_url(): void
    {
        $item = Item::factory()->create();
        $other = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $other->id]);

        $this->delete(route('admin.items.variants.destroy', [$item, $variant]))->assertNotFound();

        $this->assertNotNull(ItemVariant::query()->find($variant->id));
    }

    #[Test]
    public function an_item_status_must_be_a_known_one(): void
    {
        $item = Item::factory()->create(['status' => 'draft']);

        $this->patch(route('admin.items.updateStatus', $item), ['status' => 'banana'])->assertSessionHasErrors('status');

        $this->assertSame('draft', $item->fresh()->status);
    }

    // ---- Canvas ------------------------------------------------------------

    #[Test]
    public function opening_the_canvas_creates_a_first_one_and_lists_other_users_to_share_with(): void
    {
        $this->user();

        $this->get(route('admin.canvas.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Canvas')
                ->where('canvases', fn ($rows) => count($rows) === 1)
                ->where('allUsers', fn ($rows) => count($rows) === 1)
                ->where('latestSnapshot', null));

        $this->assertSame(1, Canvas::query()->where('user_id', $this->admin->id)->count());
    }

    #[Test]
    public function a_canvas_needs_a_title(): void
    {
        $this->post(route('admin.canvas.create'), [])->assertSessionHasErrors('title');
        $this->assertSame(0, Canvas::query()->count());
    }

    #[Test]
    public function an_admin_creates_a_canvas_and_lands_on_it(): void
    {
        $this->post(route('admin.canvas.create'), ['title' => 'Floor plan'])->assertSessionHasNoErrors();

        $canvas = Canvas::query()->where('title', 'Floor plan')->sole();
        $this->assertSame($this->admin->id, (int) $canvas->user_id);
    }

    #[Test]
    public function saving_stores_a_pending_version_that_can_be_read_back(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);

        $saved = $this->postJson(route('admin.canvas.save'), [
            'canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1, 2]], 'comment' => 'first draft',
        ])->assertOk()->assertJsonStructure(['message', 'version_id']);

        $version = CanvasVersion::query()->findOrFail($saved->json('version_id'));
        $this->assertSame('pending', $version->status);
        $this->assertSame($this->admin->id, (int) $version->user_id);

        $this->getJson(route('admin.canvas.version', $version->id))->assertOk()->assertExactJson(['shapes' => [1, 2]]);

        $this->get(route('admin.canvas.index', ['canvas_id' => $canvas->id]))
            ->assertInertia(fn ($page) => $page->where('latestSnapshot.shapes', [1, 2]));
    }

    #[Test]
    public function saving_needs_a_real_canvas_and_a_snapshot(): void
    {
        $this->postJson(route('admin.canvas.save'), [])->assertJsonValidationErrors(['canvas_id', 'snapshot_json']);
        $this->postJson(route('admin.canvas.save'), ['canvas_id' => 999999, 'snapshot_json' => []])->assertJsonValidationErrors('canvas_id');
        $this->getJson(route('admin.canvas.version', 999999))->assertNotFound();
    }

    #[Test]
    public function an_owner_shares_a_canvas_and_the_other_user_then_sees_it(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);
        $friend = $this->user('admin');

        $this->post(route('admin.canvas.share'), ['canvas_id' => $canvas->id, 'user_id' => $friend->id, 'permission' => 'edit'])
            ->assertSessionHas('success');
        $this->assertSame('edit', $canvas->shares()->where('users.id', $friend->id)->first()->pivot->permission);

        $this->actingAs($friend);
        $this->get(route('admin.canvas.index'))->assertInertia(fn ($page) => $page
            ->where('canvases', fn ($rows) => collect($rows)->pluck('id')->contains($canvas->id)));

        $this->actingAs($this->admin);
        $this->post(route('admin.canvas.unshare'), ['canvas_id' => $canvas->id, 'user_id' => $friend->id])->assertSessionHas('success');
        $this->assertSame(0, $canvas->shares()->count());
    }

    #[Test]
    public function only_the_owner_may_share_and_the_permission_must_be_valid(): void
    {
        $theirs = Canvas::query()->create(['user_id' => $this->user('admin')->id, 'title' => 'Not mine']);
        $mine = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Mine']);
        $friend = $this->user('admin');

        $this->post(route('admin.canvas.share'), ['canvas_id' => $theirs->id, 'user_id' => $friend->id, 'permission' => 'view'])->assertNotFound();
        $this->post(route('admin.canvas.unshare'), ['canvas_id' => $theirs->id, 'user_id' => $friend->id])->assertNotFound();
        $this->post(route('admin.canvas.share'), ['canvas_id' => $mine->id, 'user_id' => $friend->id, 'permission' => 'owner'])->assertSessionHasErrors('permission');

        $this->assertSame(0, $theirs->shares()->count());
        $this->assertSame(0, $mine->shares()->count());
    }

    #[Test]
    public function a_version_needs_a_comment_of_at_most_60_characters(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);
        $body = ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => []]];

        $this->postJson(route('admin.canvas.save'), $body)->assertJsonValidationErrors('comment');
        $this->postJson(route('admin.canvas.save'), $body + ['comment' => str_repeat('a', 61)])->assertJsonValidationErrors('comment');
        $this->postJson(route('admin.canvas.save'), $body + ['comment' => str_repeat('a', 60)])->assertOk();
    }

    #[Test]
    public function autosave_rewrites_one_draft_that_never_enters_the_history_and_a_save_clears_it(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);
        $this->postJson(route('admin.canvas.save'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1]], 'comment' => 'base'])->assertOk();

        $this->travel(1)->minutes();
        $this->postJson(route('admin.canvas.autosave'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1, 2]]])->assertOk()->assertJsonStructure(['saved_at']);
        $this->postJson(route('admin.canvas.autosave'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1, 2, 3]]])->assertOk();

        $this->assertSame(1, CanvasVersion::query()->where('is_draft', true)->count());
        $this->get(route('admin.canvas.index', ['canvas_id' => $canvas->id]))->assertInertia(fn ($page) => $page
            ->where('latestSnapshot.shapes', [1, 2, 3])
            ->has('history', 1)
            ->whereNot('draftSavedAt', null));

        $this->postJson(route('admin.canvas.save'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [9]], 'comment' => 'next'])->assertOk();
        $this->assertSame(0, CanvasVersion::query()->where('is_draft', true)->count());
    }

    #[Test]
    public function a_view_only_user_cannot_save_or_autosave(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);
        $viewer = $this->user('admin');
        $canvas->shares()->attach($viewer->id, ['permission' => 'view']);

        $this->actingAs($viewer);
        $body = ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => []]];
        $this->postJson(route('admin.canvas.save'), $body + ['comment' => 'x'])->assertForbidden();
        $this->postJson(route('admin.canvas.autosave'), $body)->assertForbidden();
    }

    #[Test]
    public function only_the_saver_deletes_a_version_and_a_draft_is_not_one(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);
        $colleague = $this->user('admin');
        $canvas->shares()->attach($colleague->id, ['permission' => 'edit']);

        $mine = $this->postJson(route('admin.canvas.save'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1]], 'comment' => 'mine'])->json('version_id');
        $this->postJson(route('admin.canvas.autosave'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1, 2]]])->assertOk();
        $draft = CanvasVersion::query()->where('is_draft', true)->sole();

        $this->deleteJson(route('admin.canvas.version.delete', $draft->id))->assertNotFound();

        $this->actingAs($colleague)->deleteJson(route('admin.canvas.version.delete', $mine))->assertForbidden();

        $this->actingAs($this->admin)->deleteJson(route('admin.canvas.version.delete', $mine))->assertOk()->assertJsonPath('deleted', $mine);
        $this->assertNull(CanvasVersion::query()->find($mine));
    }

    #[Test]
    public function restoring_a_version_adds_it_on_top_and_keeps_the_old_ones(): void
    {
        $canvas = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Plan']);
        $first = $this->postJson(route('admin.canvas.save'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [1]], 'comment' => 'one'])->json('version_id');
        $this->postJson(route('admin.canvas.save'), ['canvas_id' => $canvas->id, 'snapshot_json' => ['shapes' => [2]], 'comment' => 'two'])->assertOk();

        $this->postJson(route('admin.canvas.restore', $first))->assertOk()
            ->assertJsonPath('comment', 'Restored: one')
            ->assertJsonPath('snapshot_json.shapes', [1]);

        $this->assertSame(3, CanvasVersion::query()->where('canvas_id', $canvas->id)->count());
    }

    #[Test]
    public function groups_are_created_renamed_and_deleted_and_deleting_returns_canvases_to_general(): void
    {
        $this->post(route('admin.canvas.groups.create'), ['name' => 'Floor plans'])->assertSessionHasNoErrors();
        $group = CanvasGroup::query()->sole();
        $this->assertSame($this->admin->id, (int) $group->user_id);

        $this->post(route('admin.canvas.groups.create'), ['name' => ''])->assertSessionHasErrors('name');
        $this->post(route('admin.canvas.groups.create'), ['name' => str_repeat('a', 41)])->assertSessionHasErrors('name');

        $this->post(route('admin.canvas.groups.rename', $group->id), ['name' => 'Layouts'])->assertSessionHasNoErrors();
        $this->assertSame('Layouts', $group->fresh()->name);

        $this->post(route('admin.canvas.create'), ['title' => 'Shop', 'group_id' => $group->id])->assertSessionHasNoErrors();
        $canvas = Canvas::query()->where('title', 'Shop')->sole();
        $this->assertSame($group->id, (int) $canvas->canvas_group_id);

        $this->get(route('admin.canvas.index', ['canvas_id' => $canvas->id]))->assertInertia(fn ($page) => $page
            ->has('groups', 1)->where('groups.0.name', 'Layouts'));

        $this->delete(route('admin.canvas.groups.delete', $group->id))->assertSessionHas('success');
        $this->assertNull($canvas->fresh()->canvas_group_id);
        $this->assertSame(0, CanvasGroup::query()->count());
    }

    #[Test]
    public function a_canvas_moves_only_into_my_own_group_and_only_by_its_owner(): void
    {
        $mine = Canvas::query()->create(['user_id' => $this->admin->id, 'title' => 'Mine']);
        $myGroup = CanvasGroup::query()->create(['user_id' => $this->admin->id, 'name' => 'A']);
        $otherUser = $this->user('admin');
        $theirGroup = CanvasGroup::query()->create(['user_id' => $otherUser->id, 'name' => 'B']);

        $this->post(route('admin.canvas.move', $mine->id), ['group_id' => $myGroup->id])->assertSessionHasNoErrors();
        $this->assertSame($myGroup->id, (int) $mine->fresh()->canvas_group_id);

        $this->post(route('admin.canvas.move', $mine->id), ['group_id' => $theirGroup->id])->assertNotFound();
        $this->assertSame($myGroup->id, (int) $mine->fresh()->canvas_group_id);

        $this->post(route('admin.canvas.move', $mine->id), ['group_id' => null])->assertSessionHasNoErrors();
        $this->assertNull($mine->fresh()->canvas_group_id);

        // Not the owner: shared with me, but I cannot file it.
        $theirs = Canvas::query()->create(['user_id' => $otherUser->id, 'title' => 'Theirs']);
        $theirs->shares()->attach($this->admin->id, ['permission' => 'edit']);
        $this->post(route('admin.canvas.move', $theirs->id), ['group_id' => $myGroup->id])->assertNotFound();

        // Someone else's group cannot be renamed or deleted by me, nor listed.
        $this->post(route('admin.canvas.groups.rename', $theirGroup->id), ['name' => 'X'])->assertNotFound();
        $this->delete(route('admin.canvas.groups.delete', $theirGroup->id))->assertNotFound();
        $this->get(route('admin.canvas.index'))->assertInertia(fn ($page) => $page
            ->where('groups', fn ($rows) => collect($rows)->pluck('id')->all() === [$myGroup->id]));
    }

    // ---- Settings and the sign-in page -------------------------------------

    #[Test]
    public function the_settings_page_opens_for_an_admin(): void
    {
        $this->get(route('admin.settings'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Settings/Index'));
    }

    #[Test]
    public function the_settings_page_is_closed_to_guests(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->get(route('admin.settings'))->assertRedirect(route('admin.login'));
    }

    #[Test]
    public function the_admin_app_is_closed_to_other_roles(): void
    {
        $this->actingAs($this->user('seller'));

        // Tests run with one session per host, so the gate refuses rather
        // than redirecting to the seller app.
        $this->get(route('admin.settings'))->assertForbidden();
        $this->get(route('admin.users.index'))->assertForbidden();
    }

    #[Test]
    public function a_guest_sees_the_admin_welcome_and_login_pages(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->get(route('admin.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Welcome/index'));
        $this->get(route('admin.login'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Auth/Login/index'));
    }
}
