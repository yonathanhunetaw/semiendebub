import { exec } from 'node:child_process';
import path from 'node:path';

/**
 * Keeps storage/app/dev-architecture-map.json in sync while `npm run dev` is
 * running: whenever a route file, controller, model, service, form request or
 * migration changes, `php artisan dev:generate-domain-map` is re-run (debounced)
 * so /dev/architecture always reflects the code on disk.
 *
 * Disable with DUKA_DOMAIN_MAP=false in .env.
 */

const DEFAULT_WATCH = [
    'routes/**/*.php',
    'app/Http/Controllers/**/*.php',
    'app/Http/Requests/**/*.php',
    'app/Models/**/*.php',
    'app/Services/**/*.php',
    'database/migrations/**/*.php',
    'database/factories/**/*.php',
    'database/seeders/**/*.php',
    'composer.json',
    'package.json',
];

/** Cheap glob -> RegExp for the small, fixed pattern set above. */
function globToRegExp(glob) {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '__GLOBSTAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/__GLOBSTAR__/g, '(?:.*/)?');

    return new RegExp(`(?:^|/)${escaped}$`);
}

export default function domainMap(options = {}) {
    const {
        enabled = true,
        command = 'php artisan dev:generate-domain-map --quiet-summary',
        watch = DEFAULT_WATCH,
        debounce = 750,
        reload = true,
    } = options;

    const matchers = watch.map(globToRegExp);

    let timer = null;
    let running = false;
    let queued = false;

    return {
        name: 'duka:domain-map',
        apply: 'serve',

        configureServer(server) {
            if (!enabled) {
                return;
            }

            const root = server.config.root ?? process.cwd();
            const label = '\x1b[35m[domain-map]\x1b[0m';

            const matches = (file) => {
                const relative = path.relative(root, file).split(path.sep).join('/');

                return !relative.startsWith('..') && matchers.some((matcher) => matcher.test(relative));
            };

            const run = () => {
                if (running) {
                    queued = true;

                    return;
                }

                running = true;

                exec(command, { cwd: root, timeout: 60_000 }, (error, _stdout, stderr) => {
                    running = false;

                    if (error) {
                        server.config.logger.warn(`${label} generation failed: ${stderr?.trim() || error.message}`);
                    } else {
                        server.config.logger.info(`${label} dev-architecture-map.json regenerated`);

                        if (reload) {
                            server.ws.send({ type: 'full-reload', path: '*' });
                        }
                    }

                    if (queued) {
                        queued = false;
                        run();
                    }
                });
            };

            const schedule = (file) => {
                if (!matches(file)) {
                    return;
                }

                if (timer) {
                    clearTimeout(timer);
                }

                timer = setTimeout(run, debounce);
            };

            // Vite only watches files in the module graph — add the PHP sources explicitly.
            watch.forEach((pattern) => server.watcher.add(path.resolve(root, pattern)));

            server.watcher.on('add', schedule);
            server.watcher.on('change', schedule);
            server.watcher.on('unlink', schedule);

            // Build the map once when the dev server boots.
            run();
        },
    };
}
