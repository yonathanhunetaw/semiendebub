<?php

declare(strict_types=1);

namespace App\Http\Controllers\Dev;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Showcase of the shared UI components (resources/js/Components/Shared/ui)
 * in every role x light/dark, so they can be checked by eye without switching
 * subdomains. Everything the page shows is client-side; there is no data.
 */
final class DesignSystemController extends Controller
{
    /**
     * Environments allowed to reach the showcase.
     *
     * @var list<string>
     */
    private const ALLOWED_ENVIRONMENTS = ['local', 'development', 'testing'];

    public function index(): Response
    {
        abort_unless(
            app()->environment(self::ALLOWED_ENVIRONMENTS),
            HttpResponse::HTTP_NOT_FOUND
        );

        return Inertia::render('Dev/DesignSystem/index');
    }
}
