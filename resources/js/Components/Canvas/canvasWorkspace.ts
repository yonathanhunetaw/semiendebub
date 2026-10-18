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

/** The workspace panel's colours, in one place. */
export const ws = {
    page: '#0b1120',
    ink: '#f1f5f9',
    muted: '#94a3b8',
    faint: '#64748b',
    card: 'rgba(30, 41, 59, 0.55)',
    cardHover: 'rgba(51, 65, 85, 0.6)',
    border: 'rgba(148, 163, 184, 0.16)',
    borderStrong: 'rgba(148, 163, 184, 0.3)',
    accent: '#6366f1',
    accentSoft: 'rgba(99, 102, 241, 0.16)',
    accentLine: 'rgba(129, 140, 248, 0.55)',
    mesh: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.22) 0, transparent 50%),'
        + ' radial-gradient(at 100% 0%, rgba(217, 70, 239, 0.12) 0, transparent 42%),'
        + ' radial-gradient(at 50% 100%, rgba(14, 165, 233, 0.1) 0, transparent 50%)',
};

export const workspaceTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
        success: { main: '#34d399' },
        warning: { main: '#fbbf24' },
        error: { main: '#f87171' },
        background: { default: ws.page, paper: '#111827' },
        text: { primary: ws.ink, secondary: ws.muted },
        divider: ws.border,
    },
    shape: { borderRadius: 12 },
    typography: { fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica", "Arial", sans-serif' },
});

const TINTS = ['#818cf8', '#c084fc', '#2dd4bf', '#38bdf8', '#f472b6', '#fb7185', '#fb923c', '#fbbf24', '#34d399', '#a78bfa'];

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
