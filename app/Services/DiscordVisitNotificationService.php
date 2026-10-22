<?php

namespace App\Services;

use App\Jobs\SendPublicVisitNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DiscordVisitNotificationService
{
    private const DAILY_DIGEST_BUFFER_KEY = 'discord_daily_visit_buffer';

    private const DAILY_DIGEST_SENT_AT_KEY = 'discord_daily_visit_sent_at';

    public function notify(Request $request): void
    {
        if ($request->user()) {
            Log::channel('observability')->debug('Visit notification skipped for authenticated user', [
                'host' => $request->getHost(),
                'path' => '/'.ltrim($request->path(), '/'),
            ]);

            return;
        }

        if (! $request->isMethod('GET') || ! $request->acceptsHtml()) {
            Log::channel('observability')->debug('Visit notification skipped for non-HTML or non-GET request', [
                'method' => $request->method(),
                'host' => $request->getHost(),
                'path' => '/'.ltrim($request->path(), '/'),
            ]);

            return;
        }

        // Crawlers and scanners are not visitors: a bot sweep would flood the
        // queue and the Discord channel.
        if (preg_match('/bot|crawl|spider|slurp|scan|curl|wget|python|httpclient|headless/i', (string) $request->userAgent())) {
            return;
        }

        // The geo lookup and Discord posts are slow external calls; queue them
        // so the visitor's page never waits on them.
        SendPublicVisitNotification::dispatch(
            (string) $request->ip(),
            (string) $request->getHost(),
            '/'.ltrim($request->path(), '/'),
            (string) $request->userAgent(),
        );
    }

    public function deliver(string $ip, string $host, string $path, string $userAgent): void
    {
        $cacheKey = 'discord_visit:'.sha1("{$ip}|{$host}|{$path}");

        try {
            $location = $this->resolveLocation($ip);

            $this->sendFrequentVisitAlert($cacheKey, $host, $path, $ip, $location, $userAgent);
            $this->recordDailyVisit($host, $path, $ip, $location, $userAgent);
            $this->sendDailyVisitAlertIfDue();
        } catch (\Throwable $e) {
            Log::error('Discord visit notification failed', [
                'message' => $e->getMessage(),
                'host' => $host,
                'path' => $path,
                'ip' => $ip,
            ]);
        }
    }

    private function resolveLocation(string $ip): string
    {
        $cacheKey = "geo_ip_{$ip}";

        try {
            $geo = Cache::get($cacheKey);

            if ($geo === null) {
                try {
                    $response = Http::connectTimeout(1)->timeout(2)->get("http://ip-api.com/json/{$ip}?fields=status,country,countryCode,city");
                    $geo = $response->successful() ? $response->json() : ['status' => 'fail'];
                    Cache::put($cacheKey, $geo, now()->addDay());
                } catch (\Throwable $e) {
                    // Remember the failure briefly so every visit doesn't re-wait on a dead service.
                    Cache::put($cacheKey, ['status' => 'fail'], now()->addMinutes(10));
                    throw $e;
                }
            }

            if (is_array($geo) && ($geo['status'] ?? null) === 'success') {
                $flag = $this->flagEmoji((string) ($geo['countryCode'] ?? ''));

                $place = implode(', ', array_filter([(string) ($geo['city'] ?? ''), (string) ($geo['country'] ?? '')]));

                return trim("{$flag} {$place}");
            }
        } catch (\Throwable $e) {
            Log::warning('Discord visit geolocation lookup failed', [
                'message' => $e->getMessage(),
                'ip' => $ip,
            ]);
        }

        return 'Unknown';
    }

    private function sendFrequentVisitAlert(string $cacheKey, string $host, string $path, string $ip, string $location, string $userAgent): void
    {
        $webhookUrl = config('services.discord.visit_webhook_url');

        if (! $webhookUrl) {
            Log::channel('observability')->warning('Visit webhook missing; skipping frequent visit alert');

            return;
        }

        // Suppress repeat alerts for the same IP + host + path for 10 minutes.
        if (! Cache::add($cacheKey, true, now()->addMinutes(10))) {
            Log::channel('observability')->debug('Frequent visit alert throttled', [
                'host' => $host,
                'path' => $path,
                'ip' => $ip,
            ]);

            return;
        }

        Http::connectTimeout(2)->timeout(3)->post($webhookUrl, [
            'embeds' => [[
                'title' => '👀 New Public Visit',
                'color' => 3447003,
                'fields' => [
                    ['name' => 'Host', 'value' => $host, 'inline' => true],
                    ['name' => 'Path', 'value' => $path, 'inline' => true],
                    ['name' => 'IP', 'value' => "`{$ip}`", 'inline' => true],
                    ['name' => 'Location', 'value' => $location, 'inline' => true],
                    ['name' => 'User Agent', 'value' => substr($userAgent, 0, 1024) ?: 'Unknown', 'inline' => false],
                ],
                'footer' => ['text' => config('app.name').' Visit Monitoring'],
                'timestamp' => now()->toIso8601String(),
            ]],
        ]);

        Log::channel('observability')->info('Frequent visit alert sent', [
            'host' => $host,
            'path' => $path,
            'ip' => $ip,
            'location' => $location,
        ]);
    }

    private function recordDailyVisit(string $host, string $path, string $ip, string $location, string $userAgent): void
    {
        $dailyWebhookUrl = config('services.discord.daily_visit_webhook_url');

        if (! $dailyWebhookUrl) {
            Log::channel('observability')->warning('Daily visit webhook missing; skipping daily visit buffering');

            return;
        }

        $visits = Cache::get(self::DAILY_DIGEST_BUFFER_KEY, []);
        $visits[] = [
            'time' => now()->toDateTimeString(),
            'host' => $host,
            'path' => $path,
            'ip' => $ip,
            'location' => $location,
            'user_agent' => substr($userAgent, 0, 180) ?: 'Unknown',
        ];

        // Keep the digest bounded so it cannot grow without limit.
        if (count($visits) > 200) {
            $visits = array_slice($visits, -200);
        }

        Cache::put(self::DAILY_DIGEST_BUFFER_KEY, $visits, now()->addDays(2));
        Cache::add(self::DAILY_DIGEST_SENT_AT_KEY, now()->toIso8601String(), now()->addDays(2));
    }

    private function sendDailyVisitAlertIfDue(): void
    {
        $dailyWebhookUrl = config('services.discord.daily_visit_webhook_url');

        if (! $dailyWebhookUrl) {
            Log::channel('observability')->warning('Daily visit webhook missing; skipping daily digest send');

            return;
        }

        $lastSentAt = Cache::get(self::DAILY_DIGEST_SENT_AT_KEY);

        if (! $lastSentAt) {
            Cache::put(self::DAILY_DIGEST_SENT_AT_KEY, now()->toIso8601String(), now()->addDays(2));

            return;
        }

        // Carbon 3 signs the difference: now()->diffInHours($past) is negative.
        if (\Illuminate\Support\Carbon::parse($lastSentAt)->diffInHours(now()) < 24) {
            return;
        }

        $visits = Cache::get(self::DAILY_DIGEST_BUFFER_KEY, []);

        if ($visits === []) {
            Cache::put(self::DAILY_DIGEST_SENT_AT_KEY, now()->toIso8601String(), now()->addDays(2));

            return;
        }

        $lines = [];

        foreach ($visits as $visit) {
            $lines[] = sprintf(
                '%s | %s%s | %s | %s',
                $visit['time'],
                $visit['host'],
                $visit['path'],
                $visit['location'],
                $visit['ip']
            );
        }

        $description = "Visits collected since the last 24-hour digest.\n\n";
        $maxLength = 3800;
        $appended = 0;

        foreach ($lines as $line) {
            $candidate = $description.'- '.$line."\n";

            if (strlen($candidate) > $maxLength) {
                break;
            }

            $description = $candidate;
            $appended++;
        }

        $remaining = count($lines) - $appended;

        if ($remaining > 0) {
            $description .= "\n...and {$remaining} more visits.";
        }

        Http::connectTimeout(2)->timeout(3)->post($dailyWebhookUrl, [
            'embeds' => [[
                'title' => '📬 24-Hour Visit Digest',
                'color' => 10181046,
                'description' => trim($description),
                'fields' => [
                    ['name' => 'Visit Count', 'value' => (string) count($visits), 'inline' => true],
                    ['name' => 'Window', 'value' => 'Last 24 hours', 'inline' => true],
                ],
                'footer' => ['text' => config('app.name').' Daily Visit Monitoring'],
                'timestamp' => now()->toIso8601String(),
            ]],
        ]);

        Log::channel('observability')->info('Daily visit digest sent', [
            'visit_count' => count($visits),
        ]);

        Cache::put(self::DAILY_DIGEST_SENT_AT_KEY, now()->toIso8601String(), now()->addDays(2));
        Cache::forget(self::DAILY_DIGEST_BUFFER_KEY);
    }

    private function flagEmoji(string $countryCode): string
    {
        if ($countryCode === '') {
            return '🏳️';
        }

        // Each letter maps onto its regional indicator symbol.
        return implode('', array_map(
            fn (string $char): string => mb_chr(127397 + ord($char), 'UTF-8'),
            str_split(strtoupper($countryCode)),
        ));
    }
}
