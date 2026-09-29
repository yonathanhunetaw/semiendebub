<?php

declare(strict_types=1);

namespace App\Console\Commands\Auth;

use App\Models\Auth\User;
use Illuminate\Console\Command;
use Spatie\Permission\Models\Role;

/**
 * Bring existing users' two role records back into agreement.
 *
 * A role lives in two places — the `users.role` column and the assigned Spatie
 * role — and until User began enforcing the invariant on save, different writers
 * filled different sides:
 *
 *   - the user seeder's batch loop assigned the role and left the column NULL,
 *     so admin@admin.com and stockkeeper@stockkeeper.com read as roleless to
 *     anything consulting the column, including the rule that decides which
 *     shipments you can see;
 *   - Admin\UserController and RegisteredUserController wrote the column and
 *     never assigned, so those accounts were refused by every route gate;
 *   - the user factory wrote a random privileged column value while the seeder
 *     assigned `user`.
 *
 * New writes are now consistent by construction. This repairs what is already
 * stored. The assignment wins wherever the two disagree, because that is what
 * the route gates enforce — so this never grants access a user did not already
 * have.
 */
class ReconcileUserRolesCommand extends Command
{
    protected $signature = 'users:reconcile-roles
                            {--dry-run : Report what would change without writing}';

    protected $description = "Make each user's role column and assigned role agree";

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $known = Role::query()->pluck('name')->all();

        if ($known === []) {
            $this->error('No roles are defined. Run the RolePermissionSeeder first.');

            return self::FAILURE;
        }

        $rows = [];
        $changed = 0;

        User::query()->with('roles')->orderBy('id')->chunk(200, function ($users) use (&$rows, &$changed, $dryRun, $known): void {
            foreach ($users as $user) {
                $column = $this->normalise($user->getAttributes()['role'] ?? '');
                $assigned = $user->roles->pluck('name')->map(fn ($n) => $this->normalise($n));

                // Already in step: one assignment, matching the column.
                if ($assigned->count() === 1 && $assigned->first() === $column) {
                    continue;
                }

                // The assignment is the authority; the column is the fallback
                // when nothing is assigned at all.
                $target = $assigned->first() ?? $column;

                if ($target === '' || ! in_array($target, $known, true)) {
                    $rows[] = [$user->id, $user->email, $column ?: '—', $assigned->implode(',') ?: '—', 'SKIPPED (unknown role)'];

                    continue;
                }

                $rows[] = [$user->id, $user->email, $column ?: '—', $assigned->implode(',') ?: '—', $target];
                $changed++;

                if ($dryRun) {
                    continue;
                }

                // Write the column directly and let the model's saved hook mirror
                // it onto the assignment, so there is one code path doing this.
                $user->forceFill(['role' => $target])->save();
            }
        });

        if ($rows === []) {
            $this->info('Every user already agrees with themselves. Nothing to do.');

            return self::SUCCESS;
        }

        $this->table(['id', 'email', 'column was', 'assigned was', 'now'], $rows);
        $this->info(sprintf(
            '%s %d user(s).',
            $dryRun ? 'Would reconcile' : 'Reconciled',
            $changed,
        ));

        return self::SUCCESS;
    }

    private function normalise(mixed $value): string
    {
        return strtolower(str_replace([' ', '-'], '_', (string) $value));
    }
}
