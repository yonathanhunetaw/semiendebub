import {defineConfig} from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

const devServerHost = process.env.VITE_DEV_SERVER_HOST ?? '0.0.0.0';
const devServerPort = Number(process.env.VITE_DEV_SERVER_PORT ?? 5177);
const hmrHost = process.env.VITE_HMR_HOST ?? 'duka.local';
const hmrProtocol = process.env.VITE_HMR_PROTOCOL ?? 'ws';
const appDomain = process.env.APP_SYSTEM_DOMAIN ?? 'duka.local';
const subdomainOriginPattern = new RegExp(`^https?:\\/\\/([a-z0-9-]+\\.)?${appDomain.replace('.', '\\.')}(:\\d+)?$`, 'i');

export default defineConfig({
    server: {
        host: devServerHost,
        port: devServerPort,
        strictPort: true,
        cors: {
            origin: (origin, callback) => {
                if (!origin || subdomainOriginPattern.test(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error(`Origin ${origin} is not allowed by Vite dev server CORS policy.`));
            },
        },
        allowedHosts: [`.${appDomain}`, appDomain],
        hmr: {
            host: hmrHost,
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
});
