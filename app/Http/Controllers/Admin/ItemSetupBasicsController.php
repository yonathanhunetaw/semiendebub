<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveItemBasicsRequest;
use App\Models\Item\Item;
use App\Services\Item\ItemWriter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Making a new item and editing its basics and pictures, on the item setup page. */
final class ItemSetupBasicsController extends Controller
{
    public function __construct(private readonly ItemWriter $writer)
    {
    }

    /** The first step of a new item: its basics. Everything else opens once it is saved. */
    public function create(): Response
    {
        return Inertia::render('Admin/Items/New', ['categories' => $this->writer->categoryOptions()]);
    }

    public function store(SaveItemBasicsRequest $request): RedirectResponse
    {
        $item = $this->writer->create($request->validated(), $request);
        $this->writer->evaluateDraftStatus($item, $request->validated('status'));

        return redirect()->route('admin.items.setup', $item)->with('success', "{$item->product_name} created. Add its options, barcodes, prices and shelf right here.");
    }

    public function update(SaveItemBasicsRequest $request, Item $item): RedirectResponse
    {
        $item->update([
            'product_name' => $request->validated('product_name'),
            'product_description' => $request->validated('product_description'),
            'packaging_details' => $request->validated('packaging_details'),
            'hs_code' => \App\Models\Procurement\Tariff::normalise($request->validated('hs_code')),
            'item_category_id' => $this->writer->resolveCategoryId($request->validated('item_category_id')),
        ]);
        $this->writer->evaluateDraftStatus($item, $request->validated('status'));

        return back()->with('success', 'Basics saved.');
    }

    public function addPicture(Request $request, Item $item): RedirectResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:5120']]);
        $this->writer->addGeneralImage($item, $request->file('image'));

        return back()->with('success', 'Picture added.');
    }

    public function removePicture(Request $request, Item $item): RedirectResponse
    {
        $data = $request->validate(['path' => ['required', 'string']]);
        abort_unless(in_array($data['path'], $item->general_images ?? [], true), 404);
        $this->writer->removeGeneralImage($item, $data['path']);

        return back()->with('success', 'Picture removed.');
    }
}
