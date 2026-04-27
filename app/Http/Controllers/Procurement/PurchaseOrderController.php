<?php
namespace App\Http\Controllers\Procurement;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class PurchaseOrderController extends Controller
{
    public function index()
    {
        return Inertia::render('Procurement/PurchaseOrders/Index', [
            'orders' => [] // Add your model logic here
        ]);
    }
}
