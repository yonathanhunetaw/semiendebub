<?php

namespace App\Http\Controllers\Admin;

use App\Models\Auth\User;
use App\Services\Admin\ActiveStore;
use App\Services\Admin\AdminAreas;
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
 *
 * A store admin (role admin with a store) may also be given parts of the
 * global zone, one tick each (AdminAreas); only a global admin sets them.
 */
class UserController extends Controller
{
    /** Roles only a global admin may give. */
    private const GLOBAL_ONLY_ROLES = ['admin', 'dev'];

    public function __construct(private readonly ActiveStore $activeStore, private readonly AdminAreas $areas)
    {
    }

    /**
     * Display a listing of users.
     */
    public function index()
    {
        $users = $this->activeStore->apply(User::query()->visibleTo(auth()->user()))->with(['creator', 'store:id,name', 'roles'])->get()
            ->each(fn (User $user) => $user->setAttribute('role_keys', $user->roles->pluck('name')->values()));

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
            'also_roles' => 'nullable|array',
            'also_roles.*' => ['string', \Illuminate\Validation\Rule::in($this->alsoRoleNames())],
            'is_hidden' => 'nullable|boolean',
            'store_id' => 'nullable|integer|exists:stores,id',
            'password' => 'required|string|min:8|confirmed',
            'is_driver' => 'nullable|boolean',
            'areas' => 'nullable|array',
            'areas.*' => ['string', \Illuminate\Validation\Rule::in(array_keys(AdminAreas::AREAS))],
        ]);

        // Only a courier can be a driver (the one who may carry freight).
        $validatedData['is_driver'] = $validatedData['role'] === 'delivery' && (bool) ($validatedData['is_driver'] ?? false);

        $validatedData['created_by'] = auth()->id();
        $validatedData['store_id'] = $this->storeFor($validatedData['store_id'] ?? null);
        $validatedData['is_hidden'] = $this->hiddenFlag($validatedData);

        $areas = $validatedData['areas'] ?? [];
        $also = $this->devRule($validatedData);
        unset($validatedData['areas'], $validatedData['also_roles']);
        $user = User::create($validatedData);
        $user->syncRoles($this->rolesToHold($validatedData['role'], $also));
        $this->syncAreas($user, $areas);

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
            'user' => tap($user->load(['creator', 'store', 'roles']), fn (User $user) => $user->setAttribute('role_keys', $user->roles->pluck('name')->values())),
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
                'role' => $this->mainRole($user),
                'is_hidden' => (bool) $user->is_hidden,
                'also_roles' => $user->roles->pluck('name')->reject(fn (string $name) => $name === $this->mainRole($user))->values(),
                'is_driver' => (bool) $user->is_driver,
                // Only a store admin has ticks; a global admin has every area anyway.
                'areas' => $user->store_id !== null ? $this->areas->grantedTo($user) : [],
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
            'also_roles' => 'nullable|array',
            'also_roles.*' => ['string', \Illuminate\Validation\Rule::in($this->alsoRoleNames())],
            'is_hidden' => 'nullable|boolean',
            'store_id' => 'nullable|integer|exists:stores,id',
            'is_driver' => 'nullable|boolean',
            'areas' => 'nullable|array',
            'areas.*' => ['string', \Illuminate\Validation\Rule::in(array_keys(AdminAreas::AREAS))],
        ]);

        $validatedData['is_driver'] = $validatedData['role'] === 'delivery' && (bool) ($validatedData['is_driver'] ?? false);

        if ($request->filled('password')) {
            $validatedData['password'] = $request->validate([
                'password' => 'required|string|min:8|confirmed',
            ])['password'];
        }

        $validatedData['store_id'] = $this->storeFor($validatedData['store_id'] ?? null);
        $validatedData['is_hidden'] = $this->hiddenFlag($validatedData, $user);

        $areas = $validatedData['areas'] ?? [];
        $also = $this->devRule($validatedData);
        unset($validatedData['areas'], $validatedData['also_roles']);
        $user->update($validatedData);
        $user->syncRoles($this->rolesToHold($validatedData['role'], $also));
        $this->syncAreas($user, $areas);

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

    /**
     * The roles that can be ticked beside the main one: any this admin may
     * give except admin (never an "also" role: power over the admin app comes
     * from the main role alone, so a seller ticked as admin cannot be promoted
     * by a tick) and dev, which only the dev layer may add, on a global admin.
     *
     * @return array<int, string>
     */
    private function alsoRoleNames(): array
    {
        $roles = array_diff($this->roleNames(), self::GLOBAL_ONLY_ROLES);

        // Dev rides on top of a global admin, and only the dev layer hands it out.
        if (auth()->user()?->canSeeHiddenUsers()) {
            $roles[] = 'dev';
        }

        return array_values($roles);
    }

    /**
     * Whether the saved user is hidden: only the dev layer sets it; for anyone
     * else the flag stays as it was (off for a new user).
     *
     * @param  array<string, mixed>  $data
     */
    private function hiddenFlag(array $data, ?User $existing = null): bool
    {
        if (auth()->user()?->canSeeHiddenUsers()) {
            return (bool) ($data['is_hidden'] ?? false);
        }

        return (bool) $existing?->is_hidden;
    }

    /**
     * The ticked roles, with the dev rule applied: dev rides on top of a global
     * admin only (main role admin, no store), and only the dev layer gives it.
     *
     * @param  array<string, mixed>  $data
     * @return array<int, string>
     */
    private function devRule(array $data): array
    {
        $also = $data['also_roles'] ?? [];

        if (in_array('dev', $also, true) && ($data['role'] !== 'admin' || ($data['store_id'] ?? null) !== null)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['also_roles' => 'Dev can only sit on top of a global admin.']);
        }

        return $also;
    }

    /**
     * The main role first, then the ticked ones, each once.
     *
     * @param  array<int, string>  $also
     * @return array<int, string>
     */
    private function rolesToHold(string $main, array $also): array
    {
        return array_values(array_unique([$main, ...$also]));
    }

    /** The user's main role: the column when it is one they hold, else their first assigned role. */
    private function mainRole(User $user): string
    {
        $column = strtolower(str_replace([' ', '-'], '_', (string) ($user->getAttributes()['role'] ?? '')));
        $assigned = $user->roles->pluck('name');

        return $assigned->contains($column) ? $column : ($assigned->first() ?? $column);
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        return [
            'roles' => $this->roleNames(),
            'also_role_options' => $this->alsoRoleNames(),
            'stores' => $this->activeStore->accessibleStores()
                ->map(fn ($store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])
                ->values(),
            // A global admin may leave a user without a store (a global admin
            // is exactly that); a store admin's users always have one.
            'can_assign_any_store' => $this->activeStore->isGlobal(),
            'default_store_id' => $this->activeStore->id(),
            // The dev layer: may tick Dev on a global admin and hide a user.
            'can_dev' => (bool) auth()->user()?->canSeeHiddenUsers(),
            // The global-zone parts a store admin may be given; only a global admin sees and sets them.
            'admin_areas' => $this->activeStore->isGlobal()
                ? collect(AdminAreas::AREAS)->map(fn (string $label, string $key): array => ['key' => $key, 'label' => $label])->values()
                : [],
        ];
    }

    /** A global admin's ticks for a store admin; anyone else's request leaves them as they are. */
    private function syncAreas(User $user, array $areas): void
    {
        if ($this->activeStore->isGlobal()) {
            $this->areas->sync($user->fresh(), $areas);
        }
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
        // A hidden user is a 404 to anyone outside the dev layer.
        abort_if($user->isHiddenFrom(auth()->user()), 404);
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
