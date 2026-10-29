<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The vendor's own account details. The store they run has its own profile (StoreProfileController).
 */
class ProfileController extends Controller
{
    public function index(): Response
    {
        $vendor = Auth::user();

        return Inertia::render('Vendor/Profile/index', [
            'vendor' => [
                'id' => (int) $vendor->id,
                'first_name' => $vendor->first_name,
                'last_name' => $vendor->last_name,
                'email' => $vendor->email,
                'phone_number' => $vendor->phone_number,
                'role' => $vendor->role,
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $vendor = Auth::user();

        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($vendor->id),
            ],
            'phone_number' => [
                'nullable',
                'string',
                'max:15',
                Rule::unique('users', 'phone_number')->ignore($vendor->id),
            ],
        ]);

        $vendor->update($validated);

        return back()->with('success', 'Profile updated.');
    }
}
