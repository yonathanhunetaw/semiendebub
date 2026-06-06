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
        
        // Fix for CommonJS modules
        optimizeDeps: {
            include: [
                'react',
                'react-dom',
                'react-dom/client',
                '@emotion/react',
                '@emotion/styled',
                '@mui/material',
                'hoist-non-react-statics',
            ],
            esbuildOptions: {
                mainFields: ['module', 'main'],
            },
        },
        
        // Resolve CommonJS modules properly
        resolve: {
            alias: {
                // Force ESM version
                'hoist-non-react-statics': 'hoist-non-react-statics/dist/hoist-non-react-statics.cjs.js',
            },
        },
        
        build: {
            commonjsOptions: {
                include: [/node_modules/],
                transformMixedEsModules: true,
            },
        },
    };
});