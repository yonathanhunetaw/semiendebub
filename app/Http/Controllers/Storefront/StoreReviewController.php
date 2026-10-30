<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Http\Requests\Storefront\SaveStoreReviewRequest;
use App\Models\Store\Store;
use App\Models\Store\StoreReview;
use App\Services\Storefront\StoreReviews;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** A shopper reviews a store they received an order from; a global admin hides an abusive review. */
class StoreReviewController extends Controller
{
    public function __construct(private readonly StoreReviews $reviews)
    {
    }

    public function store(SaveStoreReviewRequest $request, string $store): RedirectResponse
    {
        $shop = Store::query()->where('slug', $store)->where('status', 'active')->firstOrFail();

        $this->reviews->save($request->user(), $shop, (int) $request->validated('rating'), $request->validated('comment'));

        return back()->with('success', 'Thank you. Your review is on the store\'s page.');
    }

    public function hide(Request $request, StoreReview $review): RedirectResponse
    {
        $this->reviews->hide($review, $request->user());

        return back()->with('success', 'The review is hidden.');
    }
}
