import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    const appDomain = env.APP_DOMAIN || 'duka2.pi';
    const devPort = 5177;

    return {
        cacheDir: '/tmp/vite-cache',

        server: {
            host: true,
            port: devPort,
            strictPort: true,

            cors: true,

            origin: `http://${appDomain}:${devPort}`,

            hmr: {
                host: appDomain,
                protocol: 'ws',
                clientPort: devPort,
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
        // optimizeDeps: {
        //     force: true,
        // },
    };
});