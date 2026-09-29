<?php

declare(strict_types=1);

namespace App\Console\Commands\Shipment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Services\ShipmentWorkflowService;
use Illuminate\Console\Command;

/**
 * Why each role's shipment board shows the number it shows.
 *
 * Two boards disagreeing is usually legitimate — a seller is scoped to runs
 * touching their own store, a courier to runs they could act on — but the same
 * symptom also appears when a role fails to resolve at all, which is what
 * happened to every account whose `role` column was empty. This prints the
 * arithmetic so the difference is explainable instead of guessed at.
 *
 *     php artisan shipments:board-audit
 */
class AuditShipmentBoardsCommand extends Command
{
    protected $signature = 'shipments:board-audit
                            {--role= : Only audit users holding this role}';

    protected $description = 'Show each role board\'s shipment count and what it excludes';

    public function __construct(private readonly ShipmentWorkflowService $workflow)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $total = Shipment::query()->count();
        $boardRoles = ['admin', 'seller', 'stock_keeper', 'delivery', 'dev'];
        $only = $this->option('role');

        $users = User::query()
            ->with('roles')
            ->when($only !== null, fn ($q) => $q->role($only))
            ->get()
            ->filter(fn (User $u) => in_array($u->roleKey(), $boardRoles, true))
            ->sortBy(fn (User $u) => [$u->roleKey(), $u->email]);

        if ($users->isEmpty()) {
            $this->warn('No users hold a role with a shipment board.');

            return self::SUCCESS;
        }

        $this->line("Shipments in the database: <info>{$total}</info>");
        $this->newLine();

        $rows = [];

        foreach ($users as $user) {
            $role = $user->roleKey();
            $visible = $this->workflow->visibleQuery($user)->count();

            $listed = $this->workflow->visibleQuery($user)
                ->where('status', '!=', ShipmentWorkflowService::CANCELLED)
                ->get()
                ->filter(fn (Shipment $s) => $this->workflow->hasLegacyStatus($s))
                ->count();

            // The stock keeper board can narrow to one dock; everything else
            // lists what it can see.
            $note = match (true) {
                $role === 'admin' || $role === 'dev' => 'unrestricted',
                $role === 'delivery' => 'own runs + the unclaimed pool',
                $user->store_id === null && $role === 'stock_keeper' => 'every dock',
                $user->store_id === null => 'NO STORE — sees nothing',
                default => 'runs touching store ' . $user->store_id,
            };

            $rows[] = [
                $user->email,
                $role,
                $user->store_id ?? '—',
                $visible,
                $listed,
                $total - $visible,
                $note,
            ];
        }

        $this->table(
            ['user', 'role', 'store', 'can see', 'on board', 'out of scope', 'scope rule'],
            $rows,
        );

        $roleless = User::query()->with('roles')->get()
            ->filter(fn (User $u) => $u->roleKey() === '')
            ->map(fn (User $u) => $u->email);

        if ($roleless->isNotEmpty()) {
            $this->newLine();
            $this->error('These accounts resolve to no role at all, so every board they open is empty:');
            $roleless->each(fn (string $email) => $this->line("  - {$email}"));
            $this->line('Run <info>php artisan users:reconcile-roles</info> to repair them.');
        }

        return self::SUCCESS;
    }
}
