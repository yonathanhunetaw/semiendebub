import {defineConfig} from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
        host: '0.0.0.0', // 🔥 IMPORTANT (not duka.local)
        port: 5177,
        strictPort: true,
        hmr: {
            host: 'duka.local', // 🔥 what browser connects to
            protocol: 'ws',
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
