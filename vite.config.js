import {defineConfig} from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

const devServerHost = process.env.VITE_DEV_SERVER_HOST ?? '0.0.0.0';
const devServerPort = Number(process.env.VITE_DEV_SERVER_PORT ?? 5177);
const hmrHost = process.env.VITE_HMR_HOST ?? 'duka.local';
const hmrProtocol = process.env.VITE_HMR_PROTOCOL ?? 'ws';

export default defineConfig({
    server: {
        host: devServerHost,
        port: devServerPort,
        strictPort: true,
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
