<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | This node
    |--------------------------------------------------------------------------
    | Same variables the backup/sync scripts read from .env.production, so the
    | System status page can say which node you are looking at.
    */
    'node_name' => env('NODE_NAME', gethostname() ?: 'this node'),
    'node_role' => env('NODE_ROLE', ''),

    // The page reads the bucket at most once per this many seconds (0 = every load).
    'cache_seconds' => (int) env('SYSTEM_STATUS_CACHE_SECONDS', 15),

    // The 24-hour history reads up to 25 small objects per node, so it is cached longer.
    'history_cache_seconds' => (int) env('SYSTEM_STATUS_HISTORY_CACHE_SECONDS', 60),

    // Links shown on the page as "Related tools": [['label' => 'Ops Console', 'url' => 'http://...'], ...].
    // Empty by default; set SYSTEM_STATUS_LINKS to a JSON array to show them.
    'links' => (array) json_decode((string) env('SYSTEM_STATUS_LINKS', '[]'), true),
];
