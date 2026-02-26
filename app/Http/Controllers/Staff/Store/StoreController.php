<?php

namespace App\Http\Controllers\Staff\Store;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class StoreController extends Controller
{
    /**
     * Display the stores dashboard.
     */
    public function index()
    {
        return Inertia::render('Staff/Store/index'); // Path to your React page
    }
}
