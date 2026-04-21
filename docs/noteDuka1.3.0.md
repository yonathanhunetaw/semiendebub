# New Duka project

#### intended to be 1.3.0 to Duka-11.2.0 and use React instead of Blade & Alpinejs,

```bash
docker exec -it Duka ls
```

## --> New Laravel install (no react) <----

###                                                                

```bash
composer create-project laravel/laravel Duka
```

## ----> Install react and react-dom <----

```bash
npm i react react-dom
```

**Changed File:** `package.json`
**and:** `package-lock.json`

`package.json`

```diff
{
    "$schema": "https://www.schemastore.org/package.json",
    "private": true,
    "type": "module",
    "scripts": {
        "build": "vite build",
        "dev": "vite"
    },
    "devDependencies": {
        "@tailwindcss/vite": "^4.0.0",
        "axios": "^1.11.0",
        "concurrently": "^9.0.1",
        "laravel-vite-plugin": "^2.0.0",
        "tailwindcss": "^4.0.0",
        "vite": "^7.0.7"
+    },
+    "dependencies": {
+        "react": "^19.2.4",
+        "react-dom": "^19.2.4"
    }
}
```

## ---> Install vite plugin so that it works with react <----
---

```bash
npm install --save-dev @vitejs/plugin-react
```

**Changed File:** `package.json`
**and:** `package-lock.json`

`package.json`

```diff
{
    "$schema": "https://www.schemastore.org/package.json",
    "private": true,
    "type": "module",
    "scripts": {
        "build": "vite build",
        "dev": "vite"
    },
    "devDependencies": {
        "@tailwindcss/vite": "^4.0.0",
+       "@vitejs/plugin-react": "^5.1.2",
        "axios": "^1.11.0",
        "concurrently": "^9.0.1",
        "laravel-vite-plugin": "^2.0.0",
        "tailwindcss": "^4.0.0",
        "vite": "^7.0.7"
    },
    "dependencies": {
        "react": "^19.2.4",
        "react-dom": "^19.2.4"
    }
}
 ```

### ---> Connect with local docker mysql setup hence DB_PORT=3308 instead of the usual 3306 <----

`.env`
---

```makefile
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3308
DB_DATABASE=duka
DB_USERNAME=root
DB_PASSWORD=rootpass
```

---

# Server side inertia

```bash
composer require inertiajs/inertia-laravel
```

**Changed File:** `composer.json`
**and:** `composer.lock.json`

`composer.json`

```diff
{
    "$schema": "https://getcomposer.org/schema.json",
    "name": "laravel/laravel",
    "type": "project",
    "description": "The skeleton application for the Laravel framework.",
    "keywords": ["laravel", "framework"],
    "license": "MIT",
    "require": {
        "php": "^8.2",
+       "inertiajs/inertia-laravel": "^2.0",
        "laravel/framework": "^12.0",
        "laravel/tinker": "^2.10.1"
    },
    "require-dev": {
        "fakerphp/faker": "^1.23",
        "laravel/pail": "^1.2.2",
        "laravel/pint": "^1.24",
        "laravel/sail": "^1.41",
        "mockery/mockery": "^1.6",
        "nunomaduro/collision": "^8.6",
        "phpunit/phpunit": "^11.5.3"
    },
    "autoload": {
        "psr-4": {
            "App\\": "app/",
            "Database\\Factories\\": "database/factories/",
            "Database\\Seeders\\": "database/seeders/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "Tests\\": "tests/"
        }
    },
    "scripts": {
        "setup": [
            "composer install",
            "@php -r \"file_exists('.env') || copy('.env.example', '.env');\"",
            "@php artisan key:generate",
            "@php artisan migrate --force",
            "npm install",
            "npm run build"
        ],
        "dev": [
            "Composer\\Config::disableProcessTimeout",
            "npx concurrently -c \"#93c5fd,#c4b5fd,#fb7185,#fdba74\" \"php artisan serve\" \"php artisan queue:listen --tries=1 --timeout=0\" \"php artisan pail --timeout=0\" \"npm run dev\" --names=server,queue,logs,vite --kill-others"
        ],
        "test": [
            "@php artisan config:clear --ansi",
            "@php artisan test"
        ],
        "post-autoload-dump": [
            "Illuminate\\Foundation\\ComposerScripts::postAutoloadDump",
            "@php artisan package:discover --ansi"
        ],
        "post-update-cmd": [
            "@php artisan vendor:publish --tag=laravel-assets --ansi --force"
        ],
        "post-root-package-install": [
            "@php -r \"file_exists('.env') || copy('.env.example', '.env');\""
        ],
        "post-create-project-cmd": [
            "@php artisan key:generate --ansi",
            "@php -r \"file_exists('database/database.sqlite') || touch('database/database.sqlite');\"",
            "@php artisan migrate --graceful --ansi"
        ],
        "pre-package-uninstall": [
            "Illuminate\\Foundation\\ComposerScripts::prePackageUninstall"
        ]
    },
    "extra": {
        "laravel": {
            "dont-discover": []
        }
    },
    "config": {
        "optimize-autoloader": true,
        "preferred-install": "dist",
        "sort-packages": true,
        "allow-plugins": {
            "pestphp/pest-plugin": true,
            "php-http/discovery": true
        }
    },
    "minimum-stability": "stable",
    "prefer-stable": true
}
```

### ---> Create Root document. As inerita assumes an app.blade.php file we rename `welcome.blade.php` to

`app.blade.php`. Then in the new html add <----

#### Inside `<head>` and `<body`>
---

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    @viteReactRefresh // will explain further
    @vite('resources/js/app.jsx')
    @inertiaHead
</head>
<body>
@inertia
</body>
</html>
```

## ---> Create our inertia middleware <----

```bash
php artisan inertia:middleware
```

---
**Creates File:** `app/Http/Middleware/HandleInertiaRequests.php`

#### Then add to `bootstrap/app.php`
---

```diff
<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
+use App\Http\Middleware\HandleInertiaRequests;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
+        $middleware->web(append: [
+            HandleInertiaRequests::class,
+        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
```

---    

## Client-side setup
---

```bash
npm install @inertiajs/react
```

---
**Changed File:** `package.json`
**and:** `package-lock.json`

`package.json`

```diff
{
    "$schema": "https://www.schemastore.org/package.json",
    "private": true,
    "type": "module",
    "scripts": {
        "build": "vite build",
        "dev": "vite"
    },
    "devDependencies": {
        "@tailwindcss/vite": "^4.0.0",
        "@vitejs/plugin-react": "^5.1.2",
        "axios": "^1.11.0",
        "concurrently": "^9.0.1",
        "laravel-vite-plugin": "^2.0.0",
        "tailwindcss": "^4.0.0",
        "vite": "^7.0.7"
    },
    "dependencies": {
+       "@inertiajs/react": "^2.3.13",
        "react": "^19.2.4",
        "react-dom": "^19.2.4"
    }
}
```

## ---> Initialize the inertia app <----

**Changed File:** `resources/js/app.js`

```diff
import './bootstrap';

+ import { createInertiaApp } from '@inertiajs/react'
+ import { createRoot } from 'react-dom/client'

+ createInertiaApp({
+    resolve: name => {
+        const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true })
+        return pages[`./Pages/${name}.jsx`]
+    },
+    setup({ el, App, props }) {
+        createRoot(el).render(<App {...props} />)
+    },
+ })

```

#### since inside

```js
createInertiaApp({
    resolve: name => {
        const pages = import.meta.glob('./Pages/**/*.jsx', {eager: true})
        return pages[`./Pages/${name}.jsx`]
    }
},
```

* its looking for `./Pages/**/*.jsx` we rename `resources/js/app.js` to `resources/js/app.jsx`

### ---> Tell vite we are using react <----

#### Import react from the plugin

`npm install --save-dev @vitejs/plugin-react` we installed and then tell vite to use it
`react(),` since we are using react we don't need to tell laravel to input
`resources/css/app.css` so we delete it and rename the `.js` to `.jsx` .

**Changed File:** `vite.config.js`

```diff
 import { defineConfig } from 'vite';
 import laravel from 'laravel-vite-plugin';
 import tailwindcss from '@tailwindcss/vite';
+import react from '@vitejs/plugin-react';

 export default defineConfig({
    plugins: [
        laravel({
-           input: ['resources/css/app.css', 'resources/js/app.js'],
+           input: 'resources/js/app.jsx',    
            refresh: true,
        }),
        tailwindcss(),
+       react(),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
 });

```

## --->In the view file add `@viteReactRefresh` before

`@vite('resources/js/app.jsx')` or there will be an error and also change `.js` to `.jsx` <----

**Changed File:** `resources/views/app.blade.php`

```diff
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
+   @viteReactRefresh    
-   @vite('resources/js/app.js')
+   @vite('resources/js/app.jsx')
    @inertiaHead
</head>
<body>
    @inertia
</body>
</html>
```

## ---> Create `resources/js/Pages/Home.jsx` <----

**Created File:** `resources/js/Pages/Home.jsx`

```diff
+ export default function Home() {
+   return (
+       <div>
+         <h1>Duka</h1>
+       </div>
+    )
+ }   
```

## ---> And finally change the `routes/web.php` <----

```diff
<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
-    return view('welcome');
+    return inertia('Home');
});

```

## ---> Add tailwind which was already added by default to `resources/app.jsx` <----

```diff
 import './bootstrap';
+import '../css/app.css';

 import { createInertiaApp } from '@inertiajs/react'
 import { createRoot } from 'react-dom/client'

 createInertiaApp({
    resolve: name => {
        const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true })
        return pages[`./Pages/${name}.jsx`]
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />)
    },
 })

```

## ---> and add to class to see if the style works also <---

In React, `<>` and `</>` are called Fragments.

They are a special "ghost" tag that lets you group multiple elements together without adding an extra `<div>` to your
actual HTML.

```diff
export default function Home() {
    return (
-        <div>
+        <>
-            <h1>Duka</h1>
+            <h1 className="title">Duka</h1>
-        </div>
+        </>
    )
}   
```

---

## Alias

**Changed File:** `vite.config.js`

```javascript
import {defineConfig} from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: 'resources/js/app.jsx',
            refresh: true,
        }),
        tailwindcss(),
        react(),
    ],
    resolve: {
        alias: {
            "@": "/resources/js",
        },
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
```

---

```php
return Inertia::render('Dashboard', [
'users' => $users
]);
```

## Translating Components (Blade to JSX)

When moving your UI, use this syntax translation guide:

## Data Handling

* Blade: {{ $user->name }}
* React: {auth.user.name}

## Conditionals

* Old Blade:

```HTML
 @if($isAdmin)
<button>Delete</button>
@endif
```

* New React:

```JavaScript
{
    isAdmin && <button>Delete</button>
}
````

# Loops

* Old Blade:

```HTML
@foreach($items as $item)
<li>{{ $item->name }}</li>
@endforeach
```

* New React:

```JavaScript
{
    items.map((item) => (
        <li key={item.id}>{item.name}</li>
    ))
}
```

```bash
php artisan breeze:install react
npm install
npm run dev
```

            ### 📍 Route Migration: Store Items

Route: `admin.stores.items`
URL: `/admin/stores/{store}/items`

| Step         | Action                                                                  |
|:-------------|:------------------------------------------------------------------------|
| Controller   | `StoreController@items` returns `Inertia::render('Admin/Stores/Items')` |
| JS Component | `resources/js/Pages/Admin/Stores/Items.jsx`                             |
| Data Props   | Receives `store` (Object) and `items` (Array)                           |

**Key Code Snippet:**

```jsx
const {store, items} = usePage().props;
```

```javascript
// This is a code block
const user = {name: 'Gemini'};
```

### ---> Notes for PHPStorm <---

### ---> phpstorm settings and shortcuts <----

#### Youtube - PhpStorm for Laravel Developers - 3 Hour Full MasterClass -

* CMD + 1 -> Toggle file structure view
* CMD + p -> Search Everywhere
* Hold CMD + click (class, file ... ) -> go to that file\

#### In Search everywhere

* p/index.php -> Uses fuzzy searching to go to directory
  Curser on word
* Options + Space -> Quick definition of word (like definitions in a library)

#### Pint

```bash
 docker exec -it Duka composer require laravel/pint --dev
 ```

* pint in settings -> tools -> file watchers
* Then added a File Watcher settings -> tools -> Action on save
