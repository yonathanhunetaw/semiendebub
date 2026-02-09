import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: 'resources/js/app.tsx',
            refresh: true,
        }),
        react(),
    ],
    server: {
        host: '0.0.0.0', // Necessary for Docker to expose the service
        port: 5174,
        strictPort: true,
        hmr: {
            host: 'localhost', // Tells your browser to look at localhost, not [::1]
        },
    },
});
