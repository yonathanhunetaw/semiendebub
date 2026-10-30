<?php

namespace App\Models\Auth;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use Database\Factories\User\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\QueryException;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasFactory, HasRoles, Notifiable;

    protected $guard_name = 'web';

    // Explicitly set the guard name
    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'first_name',
        'last_name',
        'phone_number',
        'email',
        'role',
        'is_driver',
        'is_hidden',
        'password',
        'store_id',
        'home_area',
        'inventory_location_id',
        'created_by',
        'active_pricing_customer_type',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Link this model to its factory.
     */
    protected static function newFactory()
    {
        return UserFactory::new();
    }

    /**
     * Keep the two records of a user's role in step.
     *
     * A role is written in two places — the `role` column and the assigned
     * Spatie role — and the writers disagreed about which one to fill:
     *
     *   - Admin\UserController (the live user screens) and
     *     Admin\UserManagementController write only the column, so every
     *     account an admin created had no assigned role. Since CheckRole and
     *     EnsureCorrectSubdomainRole both gate on hasRole(), those users were
     *     bounced off every subdomain they were entitled to.
     *   - RegisteredUserController writes only the column too, so a
     *     self-registered account could not reach its own dashboard.
     *   - The user seeder's batch loop wrote only the assignment, so
     *     admin@admin.com and stockkeeper@stockkeeper.com read as roleless to
     *     ShipmentWorkflowService and opened an empty shipment board.
     *
     * Rather than patch each writer and wait for the next one, the invariant is
     * enforced here: set `role`, and the assignment follows. Reads go through
     * roleKey(), which prefers the assignment, so the two agree in both
     * directions.
     *
     * One exception: DatabaseSeeder uses WithoutModelEvents, so nothing below
     * runs during a seeder. Seeders must keep calling assignRole() themselves.
     */
    protected static function booted(): void
    {
        static::saved(function (self $user): void {
            $user->syncAssignedRoleFromColumn();
        });
    }

    /**
     * Mirror the `role` column onto the assigned Spatie role.
     *
     * Replaces rather than adds: the column names *the* role, so demoting an
     * admin to seller has to take the admin role away, not leave both in place.
     */
    public function syncAssignedRoleFromColumn(): void
    {
        // Only when the column was actually written, so an ordinary save (a
        // password change, a store reassignment) costs no extra queries.
        if (! $this->wasRecentlyCreated && ! $this->wasChanged('role')) {
            return;
        }

        $key = $this->normaliseRoleKey($this->getAttributes()['role'] ?? '');

        // Nothing to mirror from. An assignment made directly still stands.
        if ($key === '') {
            return;
        }

        try {
            // An unknown role name must not throw mid-save — a bad value in the
            // column is a validation problem, not a reason to fail the write.
            if (! Role::query()->where('name', $key)->where('guard_name', $this->guard_name)->exists()) {
                return;
            }

            $assigned = $this->roles()->pluck('name');

            if ($assigned->count() === 1 && $assigned->first() === $key) {
                return;
            }

            $this->syncRoles([$key]);
            $this->unsetRelation('roles');
        } catch (QueryException) {
            // The permission tables are not there yet (mid-migration). Leave it.
        }
    }

    /** `Stock Keeper`, `stock-keeper` and `stock_keeper` are the same role. */
    private function normaliseRoleKey(mixed $value): string
    {
        return strtolower(str_replace([' ', '-'], '_', (string) $value));
    }

    /**
     * The dev layer: a global admin who also holds the dev role sees every
     * user. Everyone else does not see hidden users (the demo accounts) or
     * anyone holding the dev role.
     */
    public function canSeeHiddenUsers(): bool
    {
        return $this->hasRole('dev') && $this->hasRole('admin') && $this->store_id === null;
    }

    /** Users this viewer may see (see canSeeHiddenUsers); a hidden user still sees themself. */
    public function scopeVisibleTo(\Illuminate\Database\Eloquent\Builder $query, ?self $viewer): \Illuminate\Database\Eloquent\Builder
    {
        if ($viewer?->canSeeHiddenUsers()) {
            return $query;
        }

        // Grouped, so the viewer's own row survives whatever else the caller adds.
        return $query->where(function (\Illuminate\Database\Eloquent\Builder $visible) use ($viewer): void {
            $visible->where(fn ($open) => $open->where('users.is_hidden', false)->whereDoesntHave('roles', fn ($roles) => $roles->where('name', 'dev')))
                ->when($viewer !== null, fn ($q) => $q->orWhere('users.id', $viewer->id));
        });
    }

    /** Is this user out of sight for the viewer? */
    public function isHiddenFrom(?self $viewer): bool
    {
        return ! $viewer?->canSeeHiddenUsers() && $this->isNot($viewer) && ($this->is_hidden || $this->hasRole('dev'));
    }

    /**
     * Get the customers created by the user.
     */
    public function customers()
    {
        return $this->hasMany(Customer::class, 'created_by');  // Inverse of 'belongsTo' in Customer
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Set the role attribute to lowercase before storing in the database.
     */
    public function setRoleAttribute($value)
    {
        // $this->attributes['role'] = strtolower($value);
        // Store role as lowercase and underscore-separated format
        $this->attributes['role'] = strtolower(str_replace(' ', '_', $value));
    }

    /**
     * Format the role for display purposes (e.g., "Stock Keeper").
     */
    public function getRoleAttribute($value)
    {
        // return ucwords(str_replace('_', ' ', strtolower($value)));

        // Format role for display purposes by replacing underscores with spaces and capitalizing the first letter
        return ucwords(str_replace('_', ' ', strtolower($value)));
    }

    /**
     * The role as a comparable key, e.g. `stock_keeper`.
     *
     * getRoleAttribute() formats the role for *display* ("Stock Keeper"), so
     * comparing `$user->role` against a stored value like `stock_keeper` never
     * matches for multi-word roles. Authorization must use this instead.
     *
     * There are two records of a user's role and they can disagree:
     *
     *   - the assigned Spatie role, which every route gate reads
     *     (CheckRole, EnsureCorrectSubdomainRole, AllowSubdomainLogin all call
     *     hasRole()), and
     *   - the legacy `role` column.
     *
     * They drift. The user seeder's batch loop unset `role` before insert, so
     * admin@admin.com, seller@seller.com and stockkeeper@stockkeeper.com carry a
     * Spatie role and a NULL column; the user factory does the reverse, writing
     * a column value while only ever assigning `user`. A roleless key is not a
     * harmless default either — ShipmentWorkflowService::visibleQuery() reads it
     * to decide which board you see, so those accounts passed the middleware
     * onto their own dashboard and then found it empty, with every action button
     * gone.
     *
     * The assignment is therefore the authority here too, so this agrees with
     * whatever let the user through the door. The column is used when it
     * corroborates the assignment (which keeps the answer stable for a user
     * holding several roles) and as the only source when nothing is assigned.
     */
    public function roleKey(): string
    {
        $assigned = $this->roles->pluck('name')
            ->map(fn (mixed $name): string => $this->normaliseRoleKey($name))
            ->filter();

        // Read straight past the display accessor, then normalise either form.
        $column = $this->normaliseRoleKey($this->getAttributes()['role'] ?? '');

        // Someone who holds several roles (the "also works as" ticks) is the
        // role of the app they are standing in; elsewhere they are their main
        // role. A single role never reaches this, so nothing else changes.
        if ($assigned->count() > 1 && ($here = $this->roleOfThisHost($assigned->all(), $column)) !== null) {
            return $here;
        }

        if ($column !== '' && $assigned->contains($column)) {
            return $column;
        }

        return $assigned->first() ?? $column;
    }

    /**
     * Which of the user's roles the current subdomain is the app of, if any.
     *
     * The seller app is also the store manager's, so either fits there; the
     * main role wins when both are held. Console and queue work has no
     * subdomain, so it always sees the main role.
     *
     * @param  array<int, string>  $assigned
     */
    private function roleOfThisHost(array $assigned, string $column): ?string
    {
        // Not config("subdomains.host_role_map.{$host}"): the dots in a hostname
        // would be read as nested keys.
        // A route group can say which role the request is made in (ActingAsRole):
        // the stock keeping area inside the seller app is a stock keeper's.
        $acting = request()->attributes->get('acting_role');

        if (is_string($acting) && in_array($acting, $assigned, true)) {
            return $acting;
        }

        $hostRole = config('subdomains.host_role_map', [])[request()->getHost()] ?? null;

        if ($hostRole === null) {
            return null;
        }

        $fits = array_values(array_intersect($hostRole === 'seller' ? ['seller', 'store_manager'] : [$hostRole], $assigned));

        if ($fits === []) {
            return null;
        }

        return in_array($column, $fits, true) ? $column : $fits[0];
    }

    /**
     * Case- and format-insensitive role check, e.g. is('stock_keeper').
     */
    public function isRole(string ...$roles): bool
    {
        $key = $this->roleKey();

        foreach ($roles as $role) {
            if ($key === $this->normaliseRoleKey($role)) {
                return true;
            }
        }

        return false;
    }

    /**
     * An admin with no store: every store, in whichever app they stand. Not isRole('admin'), which follows
     * the host, so a global admin ticked as seller would be a store-less seller in the seller app.
     */
    public function isGlobalAdmin(): bool
    {
        return $this->store_id === null && ($this->hasRole('admin') || $this->isRole('admin'));
    }

    /**
     * Define the relationship to carts.
     * A user can create multiple carts.
     */
    public function carts()
    {
        // A seller/staff member manages many carts
        return $this->hasMany(Cart::class, 'seller_id');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    /*
    |--------------------------------------------------------------------------
    | Facility management
    |--------------------------------------------------------------------------
    |
    | A warehouse is overseen by one or two named users. The assignments are
    | polymorphic because a warehouse is either a `warehouses` row or a `stores`
    | row of warehouse type; see App\Models\Concerns\HasFacilityManagers.
    |
    */

    /**
     * Every warehouse or facility this user has been assigned to manage.
     */
    public function facilityAssignments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(\App\Models\Inventory\FacilityManager::class, 'user_id');
    }

    public function managedFacilityCount(): int
    {
        return $this->relationLoaded('facilityAssignments')
            ? $this->facilityAssignments->count()
            : $this->facilityAssignments()->count();
    }

    /**
     * Does this user manage the given warehouse or facility?
     *
     * Asks the facility rather than scanning assignments here, so the single
     * implementation in HasFacilityManagers stays authoritative.
     */
    public function managesFacility(mixed $facility): bool
    {
        return is_object($facility)
            && method_exists($facility, 'isManagedBy')
            && $facility->isManagedBy($this);
    }

    /**
     * May this user rule on an automated replenishment proposal?
     *
     * "Store manager" is a capability, not a subdomain: the role exists so it
     * can be assigned, and the permission exists so an admin can grant the same
     * authority to a seller who runs a branch. Either is enough; which
     * *specific* transfers they may approve is TransferPolicy's business.
     */
    public function canApproveReplenishment(): bool
    {
        // can(), not hasPermissionTo(): the latter throws when the permission
        // has not been seeded yet, and an unseeded permission should read as
        // "not granted", not as a 500 on the approvals screen.
        return $this->isRole('admin', 'store_manager')
            || $this->can('approve replenishment transfers');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_driver' => 'boolean',
            'is_hidden' => 'boolean',
        ];
    }
}
