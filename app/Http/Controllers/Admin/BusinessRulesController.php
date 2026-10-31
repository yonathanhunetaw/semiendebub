<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveBusinessRulesRequest;
use App\Models\Procurement\ProcurementSetting;
use App\Models\Vendor\MarketplaceSetting;
use App\Services\Admin\BusinessRules;
use App\Services\Procurement\PurchaseOrderService;
use App\Services\Workforce\OvertimeService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Settings → Business rules (global admins): the rules that used to need a
 * .env change and a redeploy, plus where the rules kept elsewhere are set
 * (overtime, the purchase order limit, the marketplace commission).
 */
class BusinessRulesController extends Controller
{
    public function __construct(private readonly BusinessRules $rules)
    {
    }

    public function index(OvertimeService $overtime): Response
    {
        $ot = $overtime->settings();

        return Inertia::render('Admin/Settings/BusinessRules', [
            'rules' => $this->rules->present(),
            'groups' => BusinessRules::GROUPS,
            'lastSaved' => $this->rules->lastSaved(),
            // Rules with their own screen: shown here, changed there.
            'elsewhere' => [
                [
                    'label' => 'Overtime',
                    'value' => sprintf('%d h a day, then ×%s (night ×%s, rest day ×%s, holiday ×%s)', intdiv((int) $ot->daily_minutes, 60), $ot->rate_day, $ot->rate_night, $ot->rate_rest_day, $ot->rate_holiday),
                    'route' => 'admin.work.overtime',
                ],
                [
                    'label' => 'Purchase orders a global admin approves',
                    'value' => sprintf('From ETB %s', number_format(PurchaseOrderService::adminLimit())),
                    'route' => 'admin.purchase_orders.index',
                    'saved' => ProcurementSetting::query()->exists(),
                ],
                [
                    'label' => 'Marketplace commission',
                    'value' => rtrim(rtrim(number_format(MarketplaceSetting::commissionPct(), 2), '0'), '.').'% of each vendor sale',
                    'route' => 'admin.vendors.index',
                ],
            ],
        ]);
    }

    public function update(SaveBusinessRulesRequest $request): RedirectResponse
    {
        $this->rules->save($request->user(), $request->validated());

        return back()->with('success', 'Business rules saved. They apply from the next page load, on every app.');
    }
}
