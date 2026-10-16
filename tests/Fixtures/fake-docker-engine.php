<?php

declare(strict_types=1);

/*
 * A stand-in for the Docker Engine API on a unix socket, for DockerLogReaderTest.
 *
 *   php tests/Fixtures/fake-docker-engine.php /path/to/socket
 *
 * Serves just what DockerLogReader asks for: /_ping, /containers/json, and the
 * logs of three containers — "app" (framed stdout + stderr), "tty" (raw text, as
 * a TTY container writes it) and anything else (404). Runs until killed.
 */

$socket = $argv[1] ?? exit(1);
@unlink($socket);

$server = stream_socket_server('unix://'.$socket, $errno, $error);

if ($server === false) {
    fwrite(STDERR, "cannot listen: {$error}\n");
    exit(1);
}

$frame = static fn (int $stream, string $text): string => chr($stream)."\0\0\0".pack('N', strlen($text)).$text;

$routes = [
    '/v1.41/_ping' => [200, 'OK'],
    '/v1.41/containers/json' => [200, json_encode([
        ['Names' => ['/duka-prod-app'], 'Id' => 'abcdef1234567890', 'Image' => 'duka-app', 'State' => 'running', 'Status' => 'Up 2 hours (healthy)'],
        ['Names' => ['/duka-db'], 'Id' => '1234567890abcdef', 'Image' => 'mysql:8', 'State' => 'running', 'Status' => 'Up 5 minutes (health: starting)'],
        ['Names' => ['/broken'], 'Id' => 'ffff', 'Image' => 'x', 'State' => 'exited', 'Status' => 'Exited (1) 3 days ago (unhealthy)'],
        ['Names' => [], 'Id' => 'nameless'],
        'not-a-container',
        ['Names' => ['/cron'], 'Id' => 'eeee', 'Image' => 'cron', 'Status' => 'Up 1 day'],
    ])],
    '/v1.41/containers/app/logs' => [200,
        $frame(1, "2026-10-16T08:00:00.000000000Z [2026-10-16] local.INFO: booted\n2026-10-16T08:00:01.000000000Z warning: disk is filling\n")
        .$frame(2, "2026-10-16T08:00:02.000000000Z PHP Fatal error: boom\n")
        .$frame(1, "\e[32mplain green line\e[0m\n\n"),
    ],
    '/v1.41/containers/broken/logs' => [500, '{"message":"engine error"}'],
    '/v1.41/containers/tty/logs' => [200, "raw tty output\nsecond line\n"],
    '/v1.41/containers/empty/logs' => [200, ''],
];

$routes['/v1.41/containers/duka-prod-app/logs'] = $routes['/v1.41/containers/app/logs'];

while (true) {
    $client = @stream_socket_accept($server, -1);

    if ($client === false) {
        continue;
    }

    $head = '';
    while (! str_contains($head, "\r\n\r\n") && ! feof($client)) {
        $head .= fread($client, 8192);
    }

    $target = explode(' ', strtok($head, "\r\n") ?: '')[1] ?? '/';
    $path = parse_url($target, PHP_URL_PATH) ?: '/';
    [$status, $body] = $routes[$path] ?? [404, '{"message":"No such container"}'];

    fwrite($client, "HTTP/1.1 {$status} X\r\nContent-Type: application/octet-stream\r\nContent-Length: ".strlen($body)."\r\nConnection: close\r\n\r\n".$body);
    fclose($client);
}
