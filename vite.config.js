import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const appDomain = env.APP_DOMAIN || 'duka2.pi';
    const devPort = 5177;
    
    // Detect ARM/Raspberry Pi
    const isARM = process.arch === 'arm64' || process.arch === 'arm';
    
    return {
        cacheDir: '/tmp/vite-cache',
        
        server: {
            host: true,
            port: devPort,
            strictPort: true,
            cors: true,
            hmr: {
                host: appDomain,
                port: devPort,
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
        // Fix for Raspberry Pi - disable optimization
        optimizeDeps: {
            disabled: isARM ? true : false,  // Disable on Pi
            force: false,
        },
    };
});