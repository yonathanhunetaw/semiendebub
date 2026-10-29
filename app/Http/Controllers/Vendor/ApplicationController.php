<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Http\Requests\Vendor\ApplyVendorRequest;
use App\Services\Vendor\VendorOnboarding;
use Illuminate\Http\RedirectResponse;

/** "Sell on Duka": the public application to open a store (vendor V1). */
class ApplicationController extends Controller
{
    public function __construct(private readonly VendorOnboarding $onboarding)
    {
    }

    public function store(ApplyVendorRequest $request): RedirectResponse
    {
        $this->onboarding->apply($request->validated());

        return redirect()->route('vendor.welcome')->with('success', 'Thank you. We will look at your application and contact you.');
    }
}
