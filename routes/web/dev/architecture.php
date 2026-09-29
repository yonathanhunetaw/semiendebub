<?php

declare(strict_types=1);

use App\Http\Controllers\Dev\ArchitectureController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Domain Module Visualizer
|--------------------------------------------------------------------------
| Included from routes/web/dev/dev.php twice:
|   1. inside the `dev.<system-domain>` group  -> dev.architecture.*
|   2. inside a local-only `/dev` prefix group -> dev.local.architecture.*
|
| The controller itself refuses to respond outside local/development, so the
| unauthenticated local mount is safe to keep in the tree.
*/

Route::prefix('architecture')
    ->name('architecture.')
    ->group(function (): void {
        Route::get('/', [ArchitectureController::class, 'index'])->name('index');
        Route::post('/regenerate', [ArchitectureController::class, 'regenerate'])->name('regenerate');
        Route::get('/download', [ArchitectureController::class, 'download'])->name('download');
    });
