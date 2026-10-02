<?php

declare(strict_types=1);

namespace App\Http\Controllers\Dev;

use App\Http\Controllers\Admin\SessionController as AdminSessionController;

/**
 * The session list on the dev subdomain.
 *
 * Reuses the Admin controller's query and mapping wholesale — only the page
 * component differs, so the dev workspace keeps its own nav and sidebar rather
 * than switching the whole UI over to Admin.
 */
final class SessionController extends AdminSessionController
{
    protected function component(): string
    {
        return 'Dev/Sessions/index';
    }
}
