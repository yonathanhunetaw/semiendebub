import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env file from the current directory (where your .env is)
    const env = loadEnv(mode, process.cwd(), '');

    const devServerHost = env.VITE_DEV_SERVER_HOST ?? '0.0.0.0';
    const devServerPort = Number(env.VITE_DEV_SERVER_PORT ?? 5177);
    const hmrProtocol = env.VITE_HMR_PROTOCOL ?? 'ws';
    const appDomain = env.APP_SYSTEM_DOMAIN ?? 'duka2.pi';

    // Matches http(s)://sub.duka2.pi or http(s)://duka2.pi
    const subdomainOriginPattern = new RegExp(
        `^https?:\\/\\/([a-z0-9-]+\\.)*${appDomain.replace('.', '\\.')}(:\\d+)?$`,
        'i'
    );

    return {
        server: {
            host: devServerHost,
            port: devServerPort,
            strictPort: true,
            cors: {
                origin: (origin, callback) => {
                    // Allow if it matches the pattern or is the Pi's direct IP for testing
                    if (!origin || subdomainOriginPattern.test(origin) || origin.includes('192.168.1.15')) {
                        callback(null, true);
                        return;
                    }
                    callback(new Error(`Origin ${origin} is not allowed by Vite dev server CORS policy.`));
                },
            },
            allowedHosts: [`.${appDomain}`, appDomain],
            hmr: {
                host: 'duka2.pi',
                protocol: hmrProtocol,
                port: devServerPort,
                clientPort: devServerPort, 
            },
            watch: {
                usePolling: true,
            },
        },
        plugins: [
            laravel({
                input: ['resources/css/app.css', 'resources/js/app.tsx'],
                refresh: true,
            }),
            react(),
        ],
    };
});