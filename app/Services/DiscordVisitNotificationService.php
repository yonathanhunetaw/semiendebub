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
        $webhookUrl = config('services.discord.visit_webhook_url');

        if (! $webhookUrl || $request->user()) {
            return;
        }

        if (! $request->isMethod('GET') || ! $request->expectsHtml()) {
            return;
        }

        $ip = (string) $request->ip();
        $host = (string) $request->getHost();
        $path = '/'.ltrim($request->path(), '/');
        $cacheKey = 'discord_visit:'.sha1("{$ip}|{$host}|{$path}");

        // Suppress repeat alerts for the same IP + host + path for 10 minutes.
        if (! Cache::add($cacheKey, true, now()->addMinutes(10))) {
            return;
        }

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
        } catch (\Throwable $e) {
            Log::error('Discord visit notification failed', [
                'message' => $e->getMessage(),
                'host' => $host,
                'path' => $path,
                'ip' => $ip,
            ]);
        }
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
