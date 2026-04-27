<?php
namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index()
    {
        return Inertia::render('Finance/Dashboard/Index', [
            'stats' => [
                'revenue' => 50000,
                'expenses' => 32000,
                'net' => 18000
            ]
        ]);
    }
}
