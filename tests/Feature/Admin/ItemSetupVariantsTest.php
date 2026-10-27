<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Item\ItemDeployer;
use App\Services\Item\ItemWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** The variants part of the item setup page: options and their preview, barcodes, pictures. */
class ItemSetupVariantsTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Storage::fake('r2');
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $admin->assignRole('admin');
        $this->actingAs($admin);

        $this->item = Item::factory()->create(['status' => 'active']);
    }

    private function matrix(array $colors, array $packaging = [['item_packaging_type_id' => 'Piece', 'quantity' => 1]], array $sizes = []): array
    {
        return ['color_ids' => $colors, 'size_ids' => $sizes, 'packaging' => $packaging];
    }

    // ---- options, preview, variants ------------------------------------------

    #[Test]
    public function new_option_names_are_created_and_the_variants_are_generated_without_any_store_variants(): void
    {
        $this->put(route('admin.items.setup.options', $this->item), $this->matrix(['Red', 'Blue']))->assertRedirect();

        $this->assertSame(2, ItemVariant::query()->where('item_id', $this->item->id)->count());
        $this->assertSame(['Blue', 'Red'], ItemColor::query()->orderBy('name')->pluck('name')->all());
        $this->assertSame(1, (int) $this->item->fresh()->packagingTypes()->first()->pivot->quantity);
        $this->assertSame(0, StoreVariant::query()->count(), 'nothing is deployed, priced or invented by saving options');
    }

    #[Test]
    public function the_preview_counts_what_would_change_and_changes_nothing(): void
    {
        $this->put(route('admin.items.setup.options', $this->item), $this->matrix(['Red', 'Blue']));
        $before = ItemVariant::query()->count();

        $this->post(route('admin.items.setup.options.preview', $this->item), $this->matrix(['Red', 'Green']))
            ->assertOk()
            ->assertJson(['add' => 1, 'keep' => 1, 'remove' => 1, 'restore' => 0]);

        $this->assertSame($before, ItemVariant::query()->count());
        $this->assertSame(0, ItemColor::query()->where('name', 'Green')->count(), 'a preview creates no colour');
    }

    #[Test]
    public function applying_fewer_options_removes_those_variants_and_switches_their_store_variants_off(): void
    {
        $store = Store::factory()->create();
        $this->put(route('admin.items.setup.options', $this->item), $this->matrix(['Red', 'Blue']));
        app(ItemDeployer::class)->deploy($this->item->fresh(), $store);
        StoreVariant::query()->update(['active' => true]);
        $blue = ItemVariant::query()->where('item_color_id', ItemColor::where('name', 'Blue')->value('id'))->sole();

        $this->put(route('admin.items.setup.options', $this->item), $this->matrix(['Red']))->assertRedirect();

        $this->assertNull(ItemVariant::query()->find($blue->id), 'soft deleted');
        $this->assertFalse((bool) StoreVariant::query()->where('item_variant_id', $blue->id)->sole()->active);
        $this->assertTrue((bool) StoreVariant::query()->where('item_variant_id', '!=', $blue->id)->sole()->active);

        $this->post(route('admin.items.setup.options.preview', $this->item), $this->matrix(['Red', 'Blue']))->assertJson(['restore' => 1, 'add' => 0]);
    }

    #[Test]
    public function an_explicit_new_name_that_looks_like_a_number_is_a_name_not_an_id(): void
    {
        $this->put(route('admin.items.setup.options', $this->item), ['color_ids' => [], 'size_ids' => ['new:32'], 'packaging' => [['item_packaging_type_id' => 'new:Piece', 'quantity' => 1]]])->assertRedirect();

        $this->assertSame(['32'], \App\Models\Item\ItemSize::query()->pluck('name')->all());
        $this->assertSame(1, ItemVariant::query()->where('item_id', $this->item->id)->count());
    }

    // ---- barcodes -----------------------------------------------------------------

    private function twoVariants(): array
    {
        $this->put(route('admin.items.setup.options', $this->item), $this->matrix(['Red', 'Blue']));

        return ItemVariant::query()->where('item_id', $this->item->id)->orderBy('id')->get()->all();
    }

    #[Test]
    public function barcodes_are_saved_cleared_and_kept_unique(): void
    {
        [$a, $b] = $this->twoVariants();

        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$a->id => '6001234567890', $b->id => ' ABC-123 ']])->assertRedirect();
        $this->assertSame('6001234567890', $a->fresh()->barcode);
        $this->assertSame('ABC-123', $b->fresh()->barcode);

        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$b->id => '6001234567890']])
            ->assertSessionHasErrors("barcodes.{$b->id}");
        $this->assertSame('ABC-123', $b->fresh()->barcode, 'a refused code changes nothing');

        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$a->id => '', $b->id => 'ab']])
            ->assertSessionHasErrors("barcodes.{$b->id}");
        $this->assertSame('6001234567890', $a->fresh()->barcode, 'the whole save is refused, so the blank did not clear it');

        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$a->id => '']])->assertRedirect();
        $this->assertNull($a->fresh()->barcode);
    }

    #[Test]
    public function the_same_code_twice_in_one_save_is_refused(): void
    {
        [$a, $b] = $this->twoVariants();

        $this->put(route('admin.items.setup.barcodes', $this->item), ['barcodes' => [$a->id => 'SAME-1', $b->id => 'SAME-1']])->assertSessionHasErrors();
        $this->assertNull($a->fresh()->barcode);
    }

    #[Test]
    public function a_generated_barcode_is_a_valid_ean13_in_the_shop_range_and_is_stable(): void
    {
        [$a] = $this->twoVariants();

        $this->post(route('admin.items.setup.barcode.generate', [$this->item, $a]))->assertRedirect();

        $code = $a->fresh()->barcode;
        $this->assertMatchesRegularExpression('/^2\d{12}$/', $code);
        $this->assertSame((int) substr($code, 12), app(ItemWriter::class)->checkDigit(substr($code, 0, 12)));

        $this->post(route('admin.items.setup.barcode.generate', [$this->item, $a]))->assertRedirect();
        $this->assertSame($code, $a->fresh()->barcode, 'asking again keeps the code that is there');
    }

    #[Test]
    public function the_ean13_check_digit_matches_a_known_code(): void
    {
        $this->assertSame(1, app(ItemWriter::class)->checkDigit('400638133393'), '4006381333931 is a real EAN-13, so the check digit of its first twelve is 1');
    }

    // ---- pictures -----------------------------------------------------------------------

    #[Test]
    public function a_picture_goes_into_a_slot_and_comes_out_again(): void
    {
        [$a] = $this->twoVariants();

        $this->post(route('admin.items.setup.image', [$this->item, $a, 2]), ['image' => UploadedFile::fake()->image('one.jpg')])->assertRedirect();
        $images = $a->fresh()->images;
        $this->assertNotEmpty($images[2]);
        Storage::disk('r2')->assertExists($images[2]);

        // A .png over the .jpg: a new key, and the old file goes.
        $this->post(route('admin.items.setup.image', [$this->item, $a, 2]), ['image' => UploadedFile::fake()->image('two.png')])->assertRedirect();
        $png = $a->fresh()->images[2];
        $this->assertNotSame($images[2], $png);
        Storage::disk('r2')->assertMissing($images[2]);

        $this->delete(route('admin.items.setup.image.destroy', [$this->item, $a, 2]))->assertRedirect();
        $this->assertNull($a->fresh()->images[2] ?? null);
        Storage::disk('r2')->assertMissing($png);
    }

    #[Test]
    public function a_picture_for_another_items_variant_or_a_sixth_slot_is_not_found(): void
    {
        [$a] = $this->twoVariants();
        $other = Item::factory()->create();

        $this->post(route('admin.items.setup.image', [$other, $a, 0]), ['image' => UploadedFile::fake()->image('x.jpg')])->assertNotFound();
        $this->post(route('admin.items.setup.image', [$this->item, $a, 5]), ['image' => UploadedFile::fake()->image('x.jpg')])->assertNotFound();
    }

    #[Test]
    public function the_page_carries_the_options_catalogue_and_each_variants_slots(): void
    {
        $this->put(route('admin.items.setup.options', $this->item), $this->matrix(['Red']));

        $this->get(route('admin.items.setup', $this->item))->assertOk()->assertInertia(fn ($page) => $page
            ->where('options.colors.0.name', 'Red')
            ->where('options.packaging.0.quantity', 1)
            ->has('catalog.colors')
            ->has('item.variants.0.slots', 5));
    }
}
