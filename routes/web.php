<?php

/*-------------------------------------------------------------------------------------------------------------
| Auth - ('guest') & ('auth') - -> routes/auth.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/auth.php';                                // ['auth', 'verified']

/*-------------------------------------------------------------------------------------------------------------
| ADMIN - ['auth', 'verified'] - -> routes/web/admin/admin.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/admin/admin.php';                     // ['auth', 'verified', 'check_role:Admin']

/*-------------------------------------------------------------------------------------------------------------
| DELIVERY - ['auth', 'verified'] - -> routes/web/delivery/delivery.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/delivery/delivery.php';               // ['auth', 'verified', 'check_role:Delivery']

/*-------------------------------------------------------------------------------------------------------------
| DEV/LESSONS - ['auth', 'verified'] - -> routes/web/dev/lessons
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/dev/lessons/lesson4.php';
require __DIR__.'/web/dev/lessons/lesson6.php';

/*-------------------------------------------------------------------------------------------------------------
| ERRORS -> routes/web/errors/error.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/errors/error.php';

/*-------------------------------------------------------------------------------------------------------------
| FINANCE -> routes/web/finance/finance.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/finance/finance.php';                    // ['auth', 'verified', 'check_role:Finance']

/*-------------------------------------------------------------------------------------------------------------
| GUEST -> routes/web/guest/guest.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/guest/guest.php';

/*-------------------------------------------------------------------------------------------------------------
| MARKETING -> routes/web/marketing/marketing.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/marketing/marketing.php';                 // ['auth', 'verified', 'check_role:Marketing']

/*-------------------------------------------------------------------------------------------------------------
| PROCUREMENT -> routes/web/procurement/procurement.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/procurement/procurement.php';             // ['auth', 'verified', 'check_role:Procurement']

/*-------------------------------------------------------------------------------------------------------------
| SELLER -> routes/web/seller/seller.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/seller/seller.php';                        // ['auth', 'verified', 'check_role:Seller']

/*-------------------------------------------------------------------------------------------------------------
| SHARED -> routes/web/shared/shared.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/shared/shared.php';

/*-------------------------------------------------------------------------------------------------------------
| STOCK_KEEPER -> routes/web/stockkeeper/stockkeeper.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/stockkeeper/stockkeeper.php';              // ['auth', 'verified', 'check_role:StockKeeper']

/*-------------------------------------------------------------------------------------------------------------
| VENDOR -> routes/web/vendor/vendor.php
|-------------------------------------------------------------------------------------------------------------*/

require __DIR__.'/web/vendor/vendor.php';                        // ['auth', 'verified', 'check_role:Vendor']

//
// use App\Http\Controllers\Admin\ItemController;
// use App\Http\Controllers\Admin\LessonController;
// use App\Http\Controllers\Admin\SessionController;
// use App\Http\Controllers\ProfileController;
// use Illuminate\Foundation\Application;
// use Illuminate\Support\Facades\Route;
// use Inertia\Inertia;
//
// Route::get('/', function () {
//    if (auth()->check()) {
//        return redirect()->route('admin.dashboard');
//    }
//
//    return Inertia::render('Welcome', [
//        'canLogin' => Route::has('login'),
//        'canRegister' => Route::has('register'),
//        'laravelVersion' => Application::VERSION,
//        'phpVersion' => PHP_VERSION,
//    ]);
// });
//
// // Route::get('/dashboard', function () {
// //    return Inertia::render('Dashboard');
// // })->middleware(['auth', 'verified'])->name('dashboard');
//
// Route::get('/home', function () {
//    return Inertia::render('Home', ['name' => 'Mike']); // We can send a second argument as props
// })->middleware(['auth', 'verified'])->name('home');
//
// Route::get('/about', function () {
//    return inertia::render('About/About');
// })->middleware(['auth'], ['verified'])->name('about');
//
// Route::get('/home2', function () {
//    return Inertia::render('Home2', ['name' => 'Mike']); // We can send a second argument as props
// })->middleware(['auth', 'verified'])->name('home2');
//
// Route::get('/contact', function () {
//    //     sleep(3);
//    return Inertia::render('Contact');
// })->middleware(['auth', 'verified'])->name('contact');
// // Route::inertia('/', 'Home'); //->>Also works
//
// Route::get('/homepage', function () {
//    return Inertia::render('HomePage');
// })->middleware(['auth', 'verified'])->name('homepage');
//
// Route::middleware('auth')->group(function () {
//    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
//    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
//    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
// });
//
// Route::middleware(['auth', 'verified'])->group(function () {
//
//    Route::group([
//        'prefix' => 'admin',
//        'middleware' => 'check_role:Admin', // Ensure this middleware exists!
//        'as' => 'admin.',
//    ], function () {
//
//        Route::get('/dashboard', function () {
//            return Inertia::render('Admin/Dashboard/index');
//        })->name('dashboard');
//
//        Route::resource('items', ItemController::class);
//
//        Route::get('/lessons4', function () {
//            return Inertia::render('Admin/Lessons/Lesson4');
//        })->name('lessons.lesson4');
//
//        // This generates 7 routes automatically (index, show, store, etc.)
//        Route::resource('lessons6', LessonController::class)->names([
//            'index' => 'lessons.lesson6',    //     1     route('admin.lessons.lesson6')
//            'create' => 'lessons.create',     //    2     route('admin.lessons.create')
//            'store' => 'lessons.store',      //     3     route('admin.lessons.store')
//            'show' => 'lessons.show',       //      4     route('admin.lessons.show')
//            'edit' => 'lessons.edit',       //      5     route('admin.lessons.edit')
//            'update' => 'lessons.update',     //    6     route('admin.lessons.update')
//            'destroy' => 'lessons.destroy',    //   7     route('admin.lessons.destroy')
//        ]);
//
//        // Session management routes
//        Route::prefix('sessions')->group(function () {
//            Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
//            Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
//        });
//
//        // Add your other admin routes (users, items, etc.) here later
//    });
//
// });
//
// use App\Http\Controllers\Admin\ItemController;
// use App\Http\Controllers\Admin\LessonController;
// use App\Http\Controllers\Admin\SessionController;
// use App\Http\Controllers\ProfileController;
// use Illuminate\Foundation\Application;
// use Illuminate\Support\Facades\Route;
// use Inertia\Inertia;
//
// Route::get('/', function () {
//    if (auth()->check()) {
//        return redirect()->route('admin.dashboard');
//    }
//
//    return Inertia::render('Guest/Welcome', [
//        'canLogin' => Route::has('login'),
//        'canRegister' => Route::has('register'),
//        'laravelVersion' => Application::VERSION,
//        'phpVersion' => PHP_VERSION,
//    ]);
// });
//
// Route::middleware(['auth', 'verified'])->group(function () {
//
//    Route::get('/home', function () {
//        return Inertia::render('Guest/Home', ['name' => 'Mike']);
//    })->name('home');
//
//    Route::get('/home2', function () {
//        return Inertia::render('Guest/Home2', ['name' => 'Mike']);
//    })->name('home2');
//
//    Route::get('/contact', function () {
//        return Inertia::render('Guest/Contact');
//    })->name('contact');
//
//    Route::get('/about', function () {
//        return Inertia::render('Guest/About');
//    })->name('about');
//
//    Route::get('/homepage', function () {
//        return Inertia::render('Guest/HomePage');
//    })->name('homepage');
//
//    // Profile routes
//    Route::prefix('profile')->group(function () {
//        Route::get('/', [ProfileController::class, 'edit'])->name('profile.edit');
//        Route::patch('/', [ProfileController::class, 'update'])->name('profile.update');
//        Route::delete('/', [ProfileController::class, 'destroy'])->name('profile.destroy');
//    });
//
//    // Admin routes
//    Route::prefix('admin')->name('admin.')->middleware(['check_role:Admin'])->group(function () {
//
//        Route::get('/dashboard', function () {
//            return Inertia::render('Staff/Admin/Dashboard/index');
//        })->name('dashboard');
//
//        Route::resource('items', ItemController::class);
//
//        Route::get('/lessons4', function () {
//            return Inertia::render('Dev/Lessons/Lesson4/index');
//        })->name('lessons.lesson4');
//
//        Route::resource('lessons6', LessonController::class)->names([
//            'index' => 'lessons.index',
//            'create' => 'lessons.create',
//            'store' => 'lessons.store',
//            'show' => 'lessons.show',
//            'edit' => 'lessons.edit',
//            'update' => 'lessons.update',
//            'destroy' => 'lessons.destroy',
//        ]);
//
//        // Session management
//        Route::prefix('sessions')->group(function () {
//            Route::get('/', [SessionController::class, 'index'])->name('sessions.index');
//            Route::delete('/{id}', [SessionController::class, 'destroy'])->name('sessions.destroy');
//        });
//
//        // Add more admin routes (users, orders, etc.) here
//    });
// });

// require __DIR__.'/auth.php';
