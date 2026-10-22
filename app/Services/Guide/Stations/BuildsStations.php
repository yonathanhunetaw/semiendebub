<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use Illuminate\Support\Facades\Route;

/**
 * What every station provider shares: the viewer's app, and building an
 * action, a station and a link from a route name. A route the viewer's own
 * app does not have gives null, so the action (or link) is simply left out.
 */
trait BuildsStations
{
    private string $app = '';

    /** The route's path on the viewer's own app, or null when this app does not have it. */
    private function url(string $name, mixed $params = []): ?string
    {
        return Route::has($name) ? route($name, $params, false) : null;
    }

    /**
     * One action as the world posts it. Null when the viewer's app has no such route.
     *
     * @param  array<string, mixed>  $params  route parameters
     * @param  array<string, mixed>  $data  fixed data sent with it
     * @param  array<int, array<string, mixed>>  $fields  what the person fills in first
     * @return array<string, mixed>|null
     */
    private function act(string $key, string $label, string $route, array $params = [], string $method = 'post', array $data = [], array $fields = [], string $tone = 'primary', ?string $confirm = null): ?array
    {
        $url = $this->url($route, $params);

        if ($url === null) {
            return null;
        }

        return array_filter([
            'key' => $key,
            'label' => $label,
            'tone' => $tone,
            'method' => $method,
            'url' => $url,
            'data' => $data === [] ? null : $data,
            'fields' => $fields === [] ? null : $fields,
            'confirm' => $confirm,
        ], fn ($v) => $v !== null);
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function station(string $key, string $label, string $desk, array $items, array $extra = []): array
    {
        return ['key' => $key, 'label' => $label, 'desk' => $desk, 'items' => $items] + $extra;
    }

    /** @return array{label: string, url: string}|null */
    private function open(string $label, string $route, mixed $params = []): ?array
    {
        $url = $this->url($route, $params);

        return $url === null ? null : ['label' => $label, 'url' => $url];
    }

    private function person(?User $user): string
    {
        return $user === null ? '' : trim($user->first_name.' '.$user->last_name);
    }

}
