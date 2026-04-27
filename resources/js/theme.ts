import { colors, PaletteMode } from '@mui/material';

// 1. Define the unique identity for all 11 modules
// theme.ts

export const subdomainConfigs = {
    admin: { color: '#1e293b', icon: 'ShieldCheck', label: 'Admin' },
    auth: { color: '#4338ca', icon: 'Lock', label: 'Auth' },
    dev: { color: '#064e3b', icon: 'Terminal', label: 'Dev' },
    finance: { color: '#15803d', icon: 'Landmark', label: 'Finance' },
    marketing: { color: '#be185d', icon: 'Megaphone', label: 'Marketing' },
    seller: { color: '#c2410c', icon: 'Store', label: 'Seller' },
    guest: { color: '#64748b', icon: 'UserCircle', label: 'Guest' },
    delivery: { color: '#c2410c', icon: 'Truck', label: 'Delivery' },
    procurement: { color: '#0e7490', icon: 'ShoppingCart', label: 'Procurement' },
    stockkeeper: { color: '#c2410c', icon: 'Package', label: 'StockKeeper' },
    vendor: { color: '#1d4ed8', icon: 'Building2', label: 'Vendor' },
    shared: { color: '#475569', icon: 'Share2', label: 'Shared' },
};

export type SubdomainType = keyof typeof subdomainConfigs;

// 2. Updated dynamic function
export const getDesignTokens = (mode: PaletteMode, subdomain: SubdomainType = 'admin') => {
    // Get the color for the specific module, fallback to admin if not found
    const brandColor = subdomainConfigs[subdomain]?.color || subdomainConfigs.admin.color;

    return {
        palette: {
            mode,
            primary: {
                main: brandColor,
                contrastText: '#ffffff', // Ensures text on headers is always white
            },
            secondary: {
                // Indigo remains a clean accent for buttons across most themes
                main: '#6366f1',
            },
            ...(mode === 'dark'
                ? {
                    background: {
                        // Admin-style subdomains look better with a slightly navy-dark bg
                        default: '#0f172a',
                        paper: brandColor, // Sidebar/Nav can match brand in dark mode
                    },
                }
                : {
                    background: {
                        default: '#f1f5f9',
                        paper: '#ffffff',
                    },
                }),
        },
    };
};
