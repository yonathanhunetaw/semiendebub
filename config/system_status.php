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
];
