import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    // Use the actual domain that resolves to your Mac
    // Since ping duka1.local works from your Mac, use that
    const appDomain = env.APP_SYSTEM_DOMAIN || 'duka1.local';
    const devServerPort = 5177;
    
    return {
        server: {
            host: '0.0.0.0',  // Listen on all interfaces
            port: devServerPort,
            strictPort: true,
            cors: true,
            hmr: {
                host: appDomain,  // Use duka1.local since it resolves to your Mac
                protocol: 'ws',
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
        // optimizeDeps: {
        //     force: true,
        // },
    };
});