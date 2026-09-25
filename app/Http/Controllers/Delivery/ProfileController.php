<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use App\Services\DeliveryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The courier's own account details and running totals.
 */
class ProfileController extends Controller
{
    public function __construct(private readonly DeliveryService $deliveries)
    {
    }

    public function index(): Response
    {
        $courier = Auth::user();

        return Inertia::render('Delivery/Profile/index', [
            'courier' => [
                'id' => (int) $courier->id,
                'first_name' => $courier->first_name,
                'last_name' => $courier->last_name,
                'email' => $courier->email,
                'phone_number' => $courier->phone_number,
                'role' => $courier->role,
            ],
            'metrics' => $this->deliveries->metrics($courier),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $courier = Auth::user();

        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($courier->id),
            ],
            'phone_number' => [
                'nullable',
                'string',
                'max:15',
                Rule::unique('users', 'phone_number')->ignore($courier->id),
            ],
        ]);

        $courier->update($validated);

        return back()->with('success', 'Profile updated.');
    }
}
