import { createTheme } from '@mui/material';

export interface CanvasRow {
    id: number;
    user_id: number;
    title: string;
    canvas_group_id?: number | null;
    updated_at?: string;
    user?: { first_name?: string } | null;
}

export interface CanvasGroupRow {
    id: number;
    name: string;
}

export interface HistoryItem {
    id: number;
    comment: string;
    created_at: string;
    user?: { id: number; first_name: string; last_name: string };
}

export interface SharedUser {
    id: number;
    first_name: string;
    last_name?: string;
    pivot?: { permission?: string };
}

export type SyncTone = 'ok' | 'busy' | 'warn' | 'error';

/** The workspace panel's colours: flat neutral greys, like the tldraw toolbar and style panel. */
export const ws = {
    page: '#212529',
    ink: '#f0f1f2',
    muted: '#a4a7ac',
    faint: '#7b7f85',
    card: '#2a2e32',
    cardHover: '#32373c',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.2)',
    accent: '#f0f1f2',
    accentSoft: 'rgba(255, 255, 255, 0.09)',
    accentLine: 'rgba(255, 255, 255, 0.45)',
    mesh: 'none',
};

export const workspaceTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#f0f1f2', light: '#ffffff', dark: '#d6d8db', contrastText: '#16181a' },
        success: { main: '#4ec98a' },
        warning: { main: '#e0b24a' },
        error: { main: '#f0706b' },
        background: { default: ws.page, paper: '#2c3136' },
        text: { primary: ws.ink, secondary: ws.muted },
        divider: ws.border,
    },
    shape: { borderRadius: 4 },
    typography: { fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica", "Arial", sans-serif' },
    components: {
        MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
        MuiMenu: { styleOverrides: { paper: { border: '1px solid rgba(255, 255, 255, 0.1)', backgroundImage: 'none', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' } } },
        MuiDialog: { styleOverrides: { paper: { border: '1px solid rgba(255, 255, 255, 0.1)', backgroundImage: 'none' } } },
    },
});

const TINTS = ['#c9ccd1', '#b4b8be', '#9fa4ab', '#d6d8db'];

/** The same title always gets the same colour. */
export function tintFor(text: string): string {
    let hash = 0;
    for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return TINTS[hash % TINTS.length];
}

export function initialOf(text: string): string {
    return text.trim().charAt(0).toUpperCase() || '?';
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export function ago(dateStr?: string | null): string {
    if (!dateStr) return '';
    const seconds = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
