<?php

namespace App\Services;

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
            return;
        }

        if (! $request->isMethod('GET') || ! $request->acceptsHtml()) {
            return;
        }

        $ip = (string) $request->ip();
        $host = (string) $request->getHost();
        $path = '/'.ltrim($request->path(), '/');
        $cacheKey = 'discord_visit:'.sha1("{$ip}|{$host}|{$path}");

        try {
            $location = $this->resolveLocation($ip);

            $this->sendFrequentVisitAlert($cacheKey, $host, $path, $ip, $location, $request);
            $this->recordDailyVisit($host, $path, $ip, $location, $request);
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
        try {
            $geo = Cache::remember("geo_ip_{$ip}", now()->addDay(), function () use ($ip) {
                $response = Http::timeout(5)->get("http://ip-api.com/json/{$ip}?fields=status,country,countryCode,city");

                return $response->successful() ? $response->json() : null;
            });

            if (is_array($geo) && ($geo['status'] ?? null) === 'success') {
                $flag = $this->flagEmoji((string) ($geo['countryCode'] ?? ''));

                return trim("{$flag} ".($geo['city'] ?? '').', '.($geo['country'] ?? ''), ' ,');
            }
        } catch (\Throwable $e) {
            Log::warning('Discord visit geolocation lookup failed', [
                'message' => $e->getMessage(),
                'ip' => $ip,
            ]);
        }

        return 'Unknown';
    }

    private function sendFrequentVisitAlert(string $cacheKey, string $host, string $path, string $ip, string $location, Request $request): void
    {
        $webhookUrl = config('services.discord.visit_webhook_url');

        if (! $webhookUrl) {
            return;
        }

        // Suppress repeat alerts for the same IP + host + path for 10 minutes.
        if (! Cache::add($cacheKey, true, now()->addMinutes(10))) {
            return;
        }

        Http::timeout(5)->post($webhookUrl, [
            'embeds' => [[
                'title' => '👀 New Public Visit',
                'color' => 3447003,
                'fields' => [
                    ['name' => 'Host', 'value' => $host, 'inline' => true],
                    ['name' => 'Path', 'value' => $path, 'inline' => true],
                    ['name' => 'IP', 'value' => "`{$ip}`", 'inline' => true],
                    ['name' => 'Location', 'value' => $location, 'inline' => true],
                    ['name' => 'User Agent', 'value' => substr((string) $request->userAgent(), 0, 1024) ?: 'Unknown', 'inline' => false],
                ],
                'footer' => ['text' => config('app.name').' Visit Monitoring'],
                'timestamp' => now()->toIso8601String(),
            ]],
        ]);
    }

    private function recordDailyVisit(string $host, string $path, string $ip, string $location, Request $request): void
    {
        $dailyWebhookUrl = config('services.discord.daily_visit_webhook_url');

        if (! $dailyWebhookUrl) {
            return;
        }

        $visits = Cache::get(self::DAILY_DIGEST_BUFFER_KEY, []);
        $visits[] = [
            'time' => now()->toDateTimeString(),
            'host' => $host,
            'path' => $path,
            'ip' => $ip,
            'location' => $location,
            'user_agent' => substr((string) $request->userAgent(), 0, 180) ?: 'Unknown',
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
            return;
        }

        $lastSentAt = Cache::get(self::DAILY_DIGEST_SENT_AT_KEY);

        if (! $lastSentAt) {
            Cache::put(self::DAILY_DIGEST_SENT_AT_KEY, now()->toIso8601String(), now()->addDays(2));

            return;
        }

        if (now()->diffInHours($lastSentAt) < 24) {
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

        Http::timeout(5)->post($dailyWebhookUrl, [
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

        Cache::put(self::DAILY_DIGEST_SENT_AT_KEY, now()->toIso8601String(), now()->addDays(2));
        Cache::forget(self::DAILY_DIGEST_BUFFER_KEY);
    }

    private function flagEmoji(string $countryCode): string
    {
        if ($countryCode === '') {
            return '🏳️';
        }

        return implode('', array_map(function ($char) {
            return mb_convert_encoding('&#'.(127397 + ord($char)).';', 'UTF-8', 'HTML-ENTITIES');
        }, str_split(strtoupper($countryCode))));
    }
}
