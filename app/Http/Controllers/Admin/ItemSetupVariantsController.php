<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveItemOptionsRequest;
use App\Http\Requests\Admin\VariantImageRequest;
use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemVariant;
use App\Services\Item\ItemWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * The variants part of the item setup page: the colours / sizes / packaging the variants are made
 * from (with a preview of what applying them adds and removes), each variant's barcode and its pictures.
 */
final class ItemSetupVariantsController extends Controller
{
    public function __construct(private readonly ItemWriter $writer)
    {
    }

    /** What applying these options would do to the variants. Changes nothing, creates nothing. */
    public function preview(SaveItemOptionsRequest $request, Item $item): JsonResponse
    {
        $packaging = collect($request->validated('packaging') ?? [])->pluck('item_packaging_type_id')->all();

        return response()->json($this->writer->previewVariants(
            $item,
            $this->writer->lookupOptionIds($request->validated('color_ids') ?? [], ItemColor::class),
            $this->writer->lookupOptionIds($request->validated('size_ids') ?? [], ItemSize::class),
            $this->writer->lookupOptionIds($packaging, \App\Models\Item\ItemPackagingType::class),
        ));
    }

    public function saveOptions(SaveItemOptionsRequest $request, Item $item): RedirectResponse
    {
        $this->writer->syncOptions(
            $item,
            $this->writer->resolveOptionIds($request->validated('color_ids') ?? [], ItemColor::class),
            $this->writer->resolveOptionIds($request->validated('size_ids') ?? [], ItemSize::class),
            $this->writer->resolvePackagingPayload($request->validated('packaging') ?? []),
        );

        return back()->with('success', 'Variants updated.');
    }

    public function saveBarcodes(Request $request, Item $item): RedirectResponse
    {
        $data = $request->validate(['barcodes' => ['required', 'array'], 'barcodes.*' => ['nullable', 'string', 'max:64']]);
        $this->writer->saveBarcodes($item, $data['barcodes']);

        return back()->with('success', 'Barcodes saved.');
    }

    public function generateBarcode(Item $item, ItemVariant $variant): RedirectResponse
    {
        abort_unless($variant->item_id === $item->id, 404);
        $code = $variant->barcode !== null && $variant->barcode !== '' ? $variant->barcode : $this->writer->generateBarcode($variant);

        return back()->with('success', "Barcode {$code} is set for {$variant->sku}.");
    }

    public function uploadImage(VariantImageRequest $request, Item $item, ItemVariant $variant, int $slot): RedirectResponse
    {
        abort_unless($variant->item_id === $item->id && $slot >= 0 && $slot < ItemWriter::VARIANT_SLOTS, 404);
        $this->writer->setVariantImage($variant, $slot, $request->file('image'));

        return back()->with('success', 'Picture saved.');
    }

    public function removeImage(Item $item, ItemVariant $variant, int $slot): RedirectResponse
    {
        abort_unless($variant->item_id === $item->id && $slot >= 0 && $slot < ItemWriter::VARIANT_SLOTS, 404);
        $this->writer->removeVariantImage($variant, $slot);

        return back()->with('success', 'Picture removed.');
    }
}
