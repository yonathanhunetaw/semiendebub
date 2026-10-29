<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Exceptions\VendorException;
use App\Http\Requests\Vendor\RejectVendorApplicationRequest;
use App\Models\Store\Store;
use App\Models\Vendor\VendorApplication;
use App\Services\Vendor\VendorOnboarding;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin → Vendors (global admins): applications to open a store, approved
 * into a store + its owner, or rejected with a reason; and the vendor stores.
 */
class VendorApplicationController extends Controller
{
    public function __construct(private readonly VendorOnboarding $onboarding)
    {
    }

    public function index(Request $request): Response
    {
        $applications = VendorApplication::query()
            ->with(['reviewer:id,first_name,last_name', 'store:id,name,slug'])
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->map(fn (VendorApplication $a): array => [
                'id' => (int) $a->id,
                'business_name' => $a->business_name,
                'contact' => trim($a->contact_first_name.' '.$a->contact_last_name),
                'email' => $a->email,
                'phone_number' => $a->phone_number,
                'city' => $a->city,
                'tin_number' => $a->tin_number,
                'description' => $a->description,
                'status' => $a->status,
                'reject_reason' => $a->reject_reason,
                'reviewed_by' => $a->reviewer ? trim($a->reviewer->first_name.' '.$a->reviewer->last_name) : null,
                'reviewed_at' => $a->reviewed_at?->toIso8601String(),
                'created_at' => $a->created_at?->toIso8601String(),
                'store' => $a->store ? ['id' => (int) $a->store->id, 'name' => $a->store->name, 'slug' => $a->store->slug] : null,
            ]);

        $stores = Store::query()
            ->where('type', Store::TYPE_RETAIL)
            ->with('owner:id,first_name,last_name,email')
            ->orderBy('name')
            ->get()
            ->map(fn (Store $s): array => [
                'id' => (int) $s->id,
                'name' => $s->name,
                'slug' => $s->slug,
                'status' => $s->status,
                'public_url' => $s->slug ? route('storefront.store', $s->slug) : null,
                'owner' => $s->owner ? ['id' => (int) $s->owner->id, 'name' => trim($s->owner->first_name.' '.$s->owner->last_name), 'email' => $s->owner->email] : null,
            ]);

        return Inertia::render('Admin/Vendors/Index', [
            'applications' => $applications,
            'stores' => $stores,
            // Shown once, right after an approval: the owner's set-password link.
            'handover' => $request->session()->get('vendor_handover'),
        ]);
    }

    public function approve(Request $request, VendorApplication $application): RedirectResponse
    {
        try {
            $result = $this->onboarding->approve($application, $request->user());
        } catch (VendorException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return redirect()->route('admin.vendors.index')
            ->with('success', "{$result['store']->name} is open. Give the owner the link below to set their password.")
            ->with('vendor_handover', [
                'store' => $result['store']->name,
                'owner' => trim($result['owner']->first_name.' '.$result['owner']->last_name),
                'email' => $result['owner']->email,
                'url' => $result['set_password_url'],
            ]);
    }

    public function reject(RejectVendorApplicationRequest $request, VendorApplication $application): RedirectResponse
    {
        try {
            $this->onboarding->reject($application, $request->user(), (string) $request->validated('reason'));
        } catch (VendorException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$application->business_name}'s application was rejected.");
    }

    /** A new set-password link for a store's owner (the first one expired, or was lost). */
    public function link(Store $store): RedirectResponse
    {
        abort_if($store->owner === null, 404);

        return redirect()->route('admin.vendors.index')->with('vendor_handover', [
            'store' => $store->name,
            'owner' => trim($store->owner->first_name.' '.$store->owner->last_name),
            'email' => $store->owner->email,
            'url' => $this->onboarding->setPasswordUrl($store->owner),
        ]);
    }
}
