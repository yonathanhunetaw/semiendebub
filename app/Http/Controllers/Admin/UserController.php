<?php

namespace App\Http\Controllers\Admin;

use App\Events\UserCreated;
use App\Models\Auth\User;
use App\Services\TelegramService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class UserController extends Controller
{
    /**
     * Display a listing of users.
     */
    public function index()
    {
        // $users = User::with('customers')->get(); // Eager load customers
        // $users = User::with(['customers', 'creator'])->get();
        // Fetch all users and include the user who created them
        $users = User::with('creator')->get();

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
        ]);
    }

    /**
     * Show the form for creating a new user.
     */
    public function create()
    {
        return Inertia::render('Admin/Users/Create', $this->formOptions());
    }

    /**
     * Store a newly created user in storage.
     *
     * The role is both written to the column and assigned as the access role,
     * because the subdomain gates read the assignment (User::roleKey()). A user
     * with only the column set could not get into their own app.
     */
    public function store(Request $request)
    {
        $validatedData = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|email|unique:users',
            'phone_number' => 'nullable|string|max:20',
            'role' => ['required', 'string', \Illuminate\Validation\Rule::in($this->roleNames())],
            'store_id' => 'nullable|integer|exists:stores,id',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $validatedData['created_by'] = auth()->id();

        $user = User::create($validatedData);
        $user->syncRoles([$validatedData['role']]);

        event(new UserCreated($user));

        return redirect()->route('admin.users.index')->with('success', 'User created successfully.');
    }

    /**
     * Display the specified user.
     */
    public function show(User $user)
    {
        // This used to load every user and pass the collection as "the user".
        return Inertia::render('Admin/Users/Show', [
            'user' => $user->load(['creator', 'store']),
        ]);
    }

    /**
     * Show the form for editing the specified user.
     */
    public function edit(User $user)
    {
        return Inertia::render('Admin/Users/Edit', $this->formOptions() + [
            // role_key, not role: the latter is the display form ("Stock
            // Keeper"), which matches no option and failed validation on save.
            'user' => $user->only(['id', 'first_name', 'last_name', 'email', 'phone_number', 'store_id']) + [
                'role' => $user->roleKey(),
            ],
        ]);
    }

    /**
     * Update the specified user in storage.
     *
     * A role change is also an access change: the assignment is synced, or the
     * user kept their old role everywhere that matters.
     */
    public function update(Request $request, User $user)
    {
        $validatedData = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'phone_number' => 'nullable|string|max:20',
            'email' => 'required|email|unique:users,email,'.$user->id,
            'role' => ['required', 'string', \Illuminate\Validation\Rule::in($this->roleNames())],
            'store_id' => 'nullable|integer|exists:stores,id',
        ]);

        if ($request->filled('password')) {
            $validatedData['password'] = $request->validate([
                'password' => 'required|string|min:8|confirmed',
            ])['password'];
        }

        $user->update($validatedData);
        $user->syncRoles([$validatedData['role']]);

        return redirect()->route('admin.users.index')->with('success', 'User updated successfully.');
    }

    /** @return array<int, string> every role that exists */
    private function roleNames(): array
    {
        return \Spatie\Permission\Models\Role::query()->orderBy('name')->pluck('name')->all();
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        return [
            'roles' => $this->roleNames(),
            'stores' => \App\Models\Store\Store::query()->orderBy('name')->get(['id', 'name']),
        ];
    }

    /**
     * Remove the specified user from storage.
     */
    public function destroy(User $user)
    {
        $user->delete();

        return redirect()->route('admin.users.index')->with('success', 'User deleted successfully.');
    }
}
