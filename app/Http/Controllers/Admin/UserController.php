<?php

namespace App\Http\Controllers\Admin;

use App\Events\UserCreated;
use App\Models\Auth\User;
use App\Services\Admin\ActiveStore;
use App\Services\TelegramService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

/**
 * Staff accounts.
 *
 * A global admin sees every user (or the active store's) and may give any role
 * and any store. A store admin sees and manages only their stores' users, can
 * never assign another store, and cannot hand out the admin or dev roles.
 */
class UserController extends Controller
{
    /** Roles only a global admin may give. */
    private const GLOBAL_ONLY_ROLES = ['admin', 'dev'];

    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    /**
     * Display a listing of users.
     */
    public function index()
    {
        $users = $this->activeStore->apply(User::query())->with(['creator', 'store:id,name'])->get();

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
        $validatedData['store_id'] = $this->storeFor($validatedData['store_id'] ?? null);

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
        $this->authorizeUser($user);

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
        $this->authorizeUser($user);

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
        $this->authorizeUser($user);

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

        $validatedData['store_id'] = $this->storeFor($validatedData['store_id'] ?? null);

        $user->update($validatedData);
        $user->syncRoles([$validatedData['role']]);

        return redirect()->route('admin.users.index')->with('success', 'User updated successfully.');
    }

    /** @return array<int, string> every role this admin may give */
    private function roleNames(): array
    {
        return \Spatie\Permission\Models\Role::query()
            ->when(! $this->activeStore->isGlobal(), fn ($q) => $q->whereNotIn('name', self::GLOBAL_ONLY_ROLES))
            ->orderBy('name')
            ->pluck('name')
            ->all();
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        return [
            'roles' => $this->roleNames(),
            'stores' => $this->activeStore->accessibleStores()
                ->map(fn ($store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])
                ->values(),
            // A global admin may leave a user without a store (a global admin
            // is exactly that); a store admin's users always have one.
            'can_assign_any_store' => $this->activeStore->isGlobal(),
            'default_store_id' => $this->activeStore->id(),
        ];
    }

    /** The store a user is saved against; a store admin's pick is never trusted. */
    private function storeFor(mixed $requested): ?int
    {
        if ($this->activeStore->isGlobal()) {
            return is_numeric($requested) ? (int) $requested : null;
        }

        return $this->activeStore->storeIdForWrite($requested);
    }

    /** Another store's user (or a global admin) is a 404 to a store admin. */
    private function authorizeUser(User $user): void
    {
        abort_unless($this->activeStore->allows($user->store_id !== null ? (int) $user->store_id : null), 404);
    }

    /**
     * Remove the specified user from storage.
     */
    public function destroy(User $user)
    {
        $this->authorizeUser($user);

        $user->delete();

        return redirect()->route('admin.users.index')->with('success', 'User deleted successfully.');
    }
}
