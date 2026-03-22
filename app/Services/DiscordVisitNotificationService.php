<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DiscordVisitNotificationService
{
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
            $geo = Cache::remember("geo_ip_{$ip}", now()->addDay(), function () use ($ip) {
                $response = Http::timeout(5)->get("http://ip-api.com/json/{$ip}?fields=status,country,countryCode,city");

                return $response->successful() ? $response->json() : null;
            });

            $location = 'Unknown';

            if (is_array($geo) && ($geo['status'] ?? null) === 'success') {
                $flag = $this->flagEmoji((string) ($geo['countryCode'] ?? ''));
                $location = trim("{$flag} ".($geo['city'] ?? '').', '.($geo['country'] ?? ''), ' ,');
            }

            $this->sendFrequentVisitAlert($cacheKey, $host, $path, $ip, $location, $request);
            $this->sendDailyVisitAlert($host, $path, $ip, $location, $request);
        } catch (\Throwable $e) {
            Log::error('Discord visit notification failed', [
                'message' => $e->getMessage(),
                'host' => $host,
                'path' => $path,
                'ip' => $ip,
            ]);
        }
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

    private function sendDailyVisitAlert(string $host, string $path, string $ip, string $location, Request $request): void
    {
        $dailyWebhookUrl = config('services.discord.daily_visit_webhook_url');

        if (! $dailyWebhookUrl) {
            return;
        }

        $dailyCacheKey = 'discord_daily_visit:'.sha1(now()->toDateString());

        if (! Cache::add($dailyCacheKey, true, now()->addDay())) {
            return;
        }

        Http::timeout(5)->post($dailyWebhookUrl, [
            'embeds' => [[
                'title' => '📬 Daily Visit Alert',
                'color' => 10181046,
                'description' => 'At least one public visit was recorded in the last 24 hours.',
                'fields' => [
                    ['name' => 'First Host', 'value' => $host, 'inline' => true],
                    ['name' => 'First Path', 'value' => $path, 'inline' => true],
                    ['name' => 'First IP', 'value' => "`{$ip}`", 'inline' => true],
                    ['name' => 'Location', 'value' => $location, 'inline' => true],
                    ['name' => 'User Agent', 'value' => substr((string) $request->userAgent(), 0, 1024) ?: 'Unknown', 'inline' => false],
                ],
                'footer' => ['text' => config('app.name').' Daily Visit Monitoring'],
                'timestamp' => now()->toIso8601String(),
            ]],
        ]);
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
