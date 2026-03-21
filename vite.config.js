import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
        host: 'duka.local',   // 🔥 critical
        port: 5177,
        strictPort: true,
        hmr: {
            host: 'duka.local',
            clientPort: 5177,
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
