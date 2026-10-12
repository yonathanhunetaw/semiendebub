<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Services\DiscordVisitNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendPublicVisitNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 30;

    public function __construct(
        public readonly string $ip,
        public readonly string $host,
        public readonly string $path,
        public readonly string $userAgent,
    ) {}

    public function handle(DiscordVisitNotificationService $service): void
    {
        $service->deliver($this->ip, $this->host, $this->path, $this->userAgent);
    }
}
