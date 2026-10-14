<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\SystemStatus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Admin → Settings → System: which node is live, how every node is doing, what
 * happened lately and whether a hand-over may have cost data. Read-only, global
 * admins only (the route sits behind `admin.global`).
 */
class SystemStatusController extends Controller
{
    public function __invoke(): Response
    {
        $disk = config('filesystems.disks.backup_r2');
        $configured = filled($disk['key'] ?? null) && filled($disk['secret'] ?? null) && filled($disk['endpoint'] ?? null);

        return Inertia::render('Admin/System/Index', [
            'configured' => $configured,
            // Closures so the page's polling reload (only: ['status', 'error']) is cheap to ask for.
            'status' => fn () => $configured ? $this->snapshot() : null,
            'error' => fn () => $this->error,
        ]);
    }

    private ?string $error = null;

    /**
     * @return array<string, mixed>|null
     */
    private function snapshot(): ?array
    {
        $ttl = (int) config('system_status.cache_seconds', 15);
        $build = static fn (): array => (new SystemStatus(Storage::disk('backup_r2')))->snapshot();

        try {
            return $ttl > 0 ? Cache::remember('admin.system-status', $ttl, $build) : $build();
        } catch (Throwable $e) {
            report($e);
            $this->error = 'Could not read the backup bucket: '.$e->getMessage();

            return null;
        }
    }
}
