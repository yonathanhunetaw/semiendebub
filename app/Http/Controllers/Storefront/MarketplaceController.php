<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Services\Storefront\MarketplaceSearch;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** /stores: every store on Duka, and one search across all of them. */
class MarketplaceController extends Controller
{
    public function __construct(private readonly MarketplaceSearch $marketplace)
    {
    }

    public function index(Request $request): Response
    {
        $query = trim((string) $request->query('q', ''));

        return Inertia::render('User/Stores/Index', [
            'query' => $query,
            'stores' => $this->marketplace->stores(),
            // Two letters at least: one letter matches nearly everything everywhere.
            'results' => mb_strlen($query) >= 2 ? $this->marketplace->search($query) : [],
        ]);
    }
}
