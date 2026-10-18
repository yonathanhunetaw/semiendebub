<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\SystemStatus;
use App\Services\Admin\UptimeHistory;
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
            // Deferred: the page renders at once and the 24-hour strips arrive a moment later.
            'history' => Inertia::defer(fn () => $configured ? $this->history() : null),
            'links' => $this->links(),
        ]);
    }

    private ?string $error = null;

    /**
     * The 24-hour strips per node, built from the nodes the status snapshot knows.
     *
     * @return array<string, mixed>|null
     */
    private function history(): ?array
    {
        $nodes = $this->snapshot()['nodes'] ?? [];

        if ($nodes === []) {
            return null;
        }

        $ttl = (int) config('system_status.history_cache_seconds', 60);
        $build = static fn (): array => (new UptimeHistory(Storage::disk('backup_r2')))->build($nodes);

        try {
            return $ttl > 0 ? Cache::remember('admin.system-history', $ttl, $build) : $build();
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    /**
     * Related tools configured in SYSTEM_STATUS_LINKS; anything that is not a plain http(s) link is dropped.
     *
     * @return list<array{label: string, url: string}>
     */
    private function links(): array
    {
        $out = [];

        foreach ((array) config('system_status.links', []) as $link) {
            $label = is_array($link) ? ($link['label'] ?? null) : null;
            $url = is_array($link) ? ($link['url'] ?? null) : null;

            if (is_string($label) && is_string($url) && preg_match('#^https?://#i', $url) === 1) {
                $out[] = ['label' => $label, 'url' => $url];
            }
        }

        return $out;
    }

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
