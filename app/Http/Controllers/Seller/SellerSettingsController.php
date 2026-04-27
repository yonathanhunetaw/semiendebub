<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SellerSettingsController extends Controller
{
    public function index()
    {
        return Inertia::render('Seller/Settings/Index');
    }

    public function update(Request $request)
    {
        // handle saving settings here later
        return back()->with('success', 'Settings updated!');
    }
}
