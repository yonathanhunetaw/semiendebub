import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Alert, Avatar, Box, Button, ButtonBase, CircularProgress, IconButton, InputBase, MenuItem, Select, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import GridViewIcon from '@mui/icons-material/GridViewRounded';
import ListIcon from '@mui/icons-material/FormatListBulleted';
import LayersIcon from '@mui/icons-material/Layers';
import HistoryIcon from '@mui/icons-material/History';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShareIcon from '@mui/icons-material/IosShare';
import SaveIcon from '@mui/icons-material/Save';
import CloudDoneIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffIcon from '@mui/icons-material/CloudOffOutlined';
import ErrorIcon from '@mui/icons-material/ErrorOutline';
import BoltIcon from '@mui/icons-material/BoltOutlined';
import PersonRemoveIcon from '@mui/icons-material/PersonRemoveOutlined';
import CanvasGroupsMenu, { CanvasSort, CanvasTab, CanvasView } from './CanvasGroupsMenu';
import {
    CanvasGroupRow, CanvasRow, HistoryItem, SharedUser, SyncTone, ago, dateTime, initialOf, tintFor, ws,
} from './canvasWorkspace';

interface Props {
    canvases: CanvasRow[];
    groups: CanvasGroupRow[];
    activeCanvasId: number;
    activeTitle: string;
    currentUserId: number;
    isOwner: boolean;
    isViewer: boolean;
    history: HistoryItem[];
    activeVersionId: number | null;
    sharedUsers: SharedUser[];
    syncTone: SyncTone;
    syncText: string;
    sizeWarning: string | null;
    onClose: () => void;
    onCreateCanvas: (groupId: number | null) => void;
    onSave: () => void;
    onLoadVersion: (id: number) => void;
    onRestoreVersion: (id: number) => void;
    onDeleteVersion: (id: number) => void;
    onShare: () => void;
    onChangePermission: (user: SharedUser, permission: 'view' | 'edit') => void;
    onRemoveUser: (user: SharedUser) => void;
}

const sectionTitleSx = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: ws.muted,
};

const syncIcon = (tone: SyncTone) => tone === 'busy'
    ? <CircularProgress size={16} thickness={5} />
    : tone === 'error' ? <ErrorIcon sx={{ fontSize: 18 }} />
    : tone === 'warn' ? <CloudOffIcon sx={{ fontSize: 18 }} />
    : <CloudDoneIcon sx={{ fontSize: 18 }} />;

const toneColor: Record<SyncTone, string> = { ok: 'success.main', busy: ws.muted, warn: 'warning.main', error: 'error.main' };
const toneWord: Record<SyncTone, string> = { ok: 'All synced', busy: 'Saving…', warn: 'Unsaved changes', error: 'Needs attention' };

function Segment({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
    return (
        <ButtonBase
            onClick={onClick}
            aria-pressed={active}
            sx={{
                px: 1.5, py: 0.75, borderRadius: 1.5, gap: 0.75, fontSize: 12.5, fontWeight: active ? 700 : 500, flexShrink: 0,
                color: active ? ws.ink : ws.muted, bgcolor: active ? ws.accentSoft : 'transparent',
                transition: 'background-color .15s, color .15s',
                '&:hover': { color: ws.ink, bgcolor: active ? ws.accentSoft : 'rgba(255, 255, 255, 0.05)' },
            }}
        >
            {label}
            <Box component="span" sx={{
                px: 0.75, borderRadius: 9, fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: ws.faint,
            }}>
                {count}
            </Box>
        </ButtonBase>
    );
}

export default function CanvasWorkspacePanel(props: Props) {
    const {
        canvases, groups, activeCanvasId, activeTitle, currentUserId, isOwner, isViewer, history, activeVersionId,
        sharedUsers, syncTone, syncText, sizeWarning,
    } = props;

    const [query, setQuery] = useState('');
    const [tab, setTab] = useState<CanvasTab>('all');
    const [sort, setSort] = useState<CanvasSort>('recent');
    const [view, setView] = useState<CanvasView>('grid');
    const [showAllVersions, setShowAllVersions] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const own = canvases.filter((c) => c.user_id === currentUserId);
    const shared = canvases.filter((c) => c.user_id !== currentUserId);

    const searching = query.trim() !== '';
    const recentPool = tab === 'mine' ? own : tab === 'shared' ? shared : canvases;
    const recent = [...recentPool]
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '') || b.id - a.id)
        .slice(0, 6);

    const latestVersionId = history[0]?.id ?? null;
    const versions = showAllVersions ? history : history.slice(0, 5);

    return (
        <>
            {/* Header */}
            <Box component="header" sx={{
                flex: 'none', px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
                borderBottom: `1px solid ${ws.border}`, bgcolor: ws.page,
            }}>
                <Box sx={{
                    width: 32, height: 32, borderRadius: 1.5, flexShrink: 0, color: ws.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: ws.card, border: `1px solid ${ws.borderStrong}`,
                }}>
                    <LayersIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, color: ws.ink }}>
                        Canvas workspace
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 11.5, color: ws.muted }}>
                        Open: <Box component="span" sx={{ color: ws.ink, fontWeight: 600 }}>{activeTitle}</Box>
                    </Typography>
                </Box>
                <IconButton aria-label="Close workspace" onClick={props.onClose} sx={{ color: ws.muted, '&:hover': { color: ws.ink } }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* Search and filters */}
            <Box component="section" sx={{ flex: 'none', px: 2, pt: 1.5, pb: 1, borderBottom: `1px solid ${ws.border}`, display: 'grid', gap: 1.25 }}>
                <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 0.5, pl: 1.5, pr: 0.5, borderRadius: 2,
                    bgcolor: ws.card, border: `1px solid ${ws.border}`,
                    '&:focus-within': { borderColor: ws.accentLine, boxShadow: 'none' },
                }}>
                    <SearchIcon sx={{ fontSize: 18, color: ws.faint }} />
                    <InputBase
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Search ${canvases.length} ${canvases.length === 1 ? 'canvas' : 'canvases'}…`}
                        inputProps={{ 'aria-label': 'Search canvases' }}
                        sx={{ flex: 1, fontSize: 13, py: 0.5, color: ws.ink }}
                    />
                    {searching && (
                        <IconButton size="small" aria-label="Clear search" onClick={() => setQuery('')} sx={{ color: ws.muted }}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    )}
                    <Tooltip title={sort === 'recent' ? 'Sorted by recent. Tap for A to Z' : 'Sorted A to Z. Tap for recent'}>
                        <IconButton size="small" aria-label="Change sort order" onClick={() => setSort(sort === 'recent' ? 'name' : 'recent')} sx={{ color: sort === 'name' ? 'primary.light' : ws.muted }}>
                            <SwapVertIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
                        <Segment label="All" count={canvases.length} active={tab === 'all'} onClick={() => setTab('all')} />
                        <Segment label="Mine" count={own.length} active={tab === 'mine'} onClick={() => setTab('mine')} />
                        <Segment label="Shared" count={shared.length} active={tab === 'shared'} onClick={() => setTab('shared')} />
                    </Box>
                    <Box sx={{ display: 'flex', p: 0.25, borderRadius: 1.5, border: `1px solid ${ws.border}`, bgcolor: ws.card, flexShrink: 0 }}>
                        {([['grid', 'Grid view', GridViewIcon], ['list', 'List view', ListIcon]] as const).map(([key, label, Icon]) => (
                            <IconButton
                                key={key}
                                size="small"
                                aria-label={label}
                                aria-pressed={view === key}
                                onClick={() => setView(key)}
                                sx={{
                                    borderRadius: 2, p: 0.5, color: view === key ? ws.ink : ws.muted,
                                    bgcolor: view === key ? ws.accentSoft : 'transparent',
                                    '&:hover': { bgcolor: view === key ? ws.accentSoft : 'rgba(255, 255, 255, 0.05)' },
                                }}
                            >
                                <Icon sx={{ fontSize: 16 }} />
                            </IconButton>
                        ))}
                    </Box>
                </Box>
            </Box>

            {/* Body */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', px: 2, py: 2, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3, alignContent: 'start', WebkitOverflowScrolling: 'touch' }}>
                {sizeWarning && <Alert severity="warning" variant="outlined" sx={{ fontSize: 12.5 }}>{sizeWarning}</Alert>}

                {/* Sync status */}
                <Box sx={{
                    p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.25,
                    border: `1px solid ${ws.border}`, bgcolor: ws.card,
                }}>
                    <Box sx={{ color: toneColor[syncTone], display: 'flex' }}>{syncIcon(syncTone)}</Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: ws.ink }}>{syncText}</Typography>
                        <Typography noWrap sx={{ fontSize: 10.5, color: ws.faint }}>Autosaves a few seconds after each change</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: ws.muted, fontSize: 11, fontWeight: 600 }}>
                        <HistoryIcon sx={{ fontSize: 15 }} />
                        {history.length}
                    </Box>
                </Box>

                {/* Recent */}
                {!searching && recent.length >= 3 && (
                    <Box component="section" aria-label="Recent canvases">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
                            <BoltIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                            <Typography sx={sectionTitleSx}>Recent</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1.25, overflowX: 'auto', pb: 0.5, mx: -2, px: 2, '&::-webkit-scrollbar': { display: 'none' } }}>
                            {recent.map((c) => {
                                const active = c.id === activeCanvasId;
                                const tint = tintFor(c.title);
                                return (
                                    <ButtonBase
                                        key={c.id}
                                        onClick={() => { if (!active) router.get('/canvas', { canvas_id: c.id }); }}
                                        aria-current={active ? 'true' : undefined}
                                        sx={{
                                            flex: '0 0 164px', display: 'block', textAlign: 'left', p: 1.25, borderRadius: 2,
                                            border: '1px solid', borderColor: active ? ws.accentLine : ws.border,
                                            bgcolor: active ? ws.accentSoft : ws.card,
                                            transition: 'transform .15s, border-color .15s',
                                            '&:hover': { borderColor: ws.borderStrong },
                                        }}
                                    >
                                        <Box sx={{
                                            height: 54, mb: 1.25, p: 1, borderRadius: 1.5, bgcolor: '#1b1e21',
                                            border: `1px solid ${ws.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        }}>
                                            <Box sx={{
                                                width: 18, height: 18, borderRadius: 1, fontSize: 10, fontWeight: 800,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: tint, bgcolor: `${tint}26`,
                                            }}>
                                                {initialOf(c.title)}
                                            </Box>
                                            <Box sx={{ display: 'grid', gap: 0.5 }}>
                                                <Box sx={{ width: '62%', height: 5, borderRadius: 1, bgcolor: ws.borderStrong }} />
                                                <Box sx={{ width: '86%', height: 4, borderRadius: 1, bgcolor: ws.border }} />
                                            </Box>
                                        </Box>
                                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700, color: ws.ink }}>{c.title}</Typography>
                                        <Typography noWrap sx={{ fontSize: 10.5, color: active ? 'success.main' : ws.faint }}>
                                            {active ? 'Open now' : c.user_id === currentUserId ? `Updated ${ago(c.updated_at)}` : `Shared by ${c.user?.first_name ?? 'a teammate'}`}
                                        </Typography>
                                    </ButtonBase>
                                );
                            })}
                        </Box>
                    </Box>
                )}

                {/* Groups and canvases */}
                <CanvasGroupsMenu
                    canvases={canvases}
                    groups={groups}
                    activeCanvasId={activeCanvasId}
                    currentUserId={currentUserId}
                    query={query}
                    tab={tab}
                    sort={sort}
                    view={view}
                    onCreateCanvas={props.onCreateCanvas}
                />

                {/* Collaboration */}
                {isOwner && (
                    <Box component="section" aria-label="Collaboration">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                            <Typography sx={sectionTitleSx}>Collaboration &amp; access</Typography>
                            <Button
                                size="small"
                                startIcon={<ShareIcon sx={{ fontSize: 16 }} />}
                                onClick={props.onShare}
                                sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: ws.ink, minWidth: 0, py: 0.25 }}
                            >
                                Share
                            </Button>
                        </Box>
                        <Box sx={{ borderRadius: 2, border: `1px solid ${ws.border}`, bgcolor: ws.card, overflow: 'hidden' }}>
                            {sharedUsers.length === 0 ? (
                                <Typography sx={{ py: 2.5, textAlign: 'center', fontSize: 12.5, color: ws.faint }}>
                                    Not shared with anyone yet.
                                </Typography>
                            ) : sharedUsers.map((u, i) => (
                                <Box key={u.id} sx={{
                                    display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1,
                                    borderTop: i === 0 ? 0 : `1px solid ${ws.border}`,
                                }}>
                                    <Avatar sx={{ width: 28, height: 28, fontSize: 12, fontWeight: 700, bgcolor: '#4a4f55', color: ws.ink }}>
                                        {initialOf(u.first_name)}
                                    </Avatar>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: ws.ink }}>
                                            {u.first_name} {u.last_name || ''}
                                        </Typography>
                                        <Select
                                            variant="standard"
                                            disableUnderline
                                            value={u.pivot?.permission || 'view'}
                                            onChange={(e) => props.onChangePermission(u, e.target.value as 'view' | 'edit')}
                                            inputProps={{ 'aria-label': `Permission for ${u.first_name}` }}
                                            sx={{ fontSize: 11.5, color: ws.muted }}
                                        >
                                            <MenuItem value="view">Can view</MenuItem>
                                            <MenuItem value="edit">Can edit</MenuItem>
                                        </Select>
                                    </Box>
                                    <Tooltip title="Remove access">
                                        <IconButton size="small" aria-label={`Remove ${u.first_name}`} onClick={() => props.onRemoveUser(u)} sx={{ color: ws.faint, '&:hover': { color: 'error.main' } }}>
                                            <PersonRemoveIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}

                {/* Version history */}
                <Box component="section" aria-label="Version history" sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{
                                width: 24, height: 24, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: 'rgba(255, 255, 255, 0.07)', color: ws.ink, border: `1px solid ${ws.border}`,
                            }}>
                                <HistoryIcon sx={{ fontSize: 15 }} />
                            </Box>
                            <Typography sx={sectionTitleSx}>Version history</Typography>
                        </Box>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: ws.muted }}>{history.length} saved</Typography>
                    </Box>

                    {history.length === 0 ? (
                        <Typography sx={{ py: 3, textAlign: 'center', fontSize: 12.5, color: ws.faint }}>
                            No versions saved yet. Autosave keeps a draft; "Save version" makes a milestone.
                        </Typography>
                    ) : (
                        <Box sx={{
                            position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25,
                            '&::before': { content: '""', position: 'absolute', left: 6, top: 14, bottom: 14, width: 2, bgcolor: ws.border },
                        }}>
                            {versions.map((item) => {
                                const current = item.id === latestVersionId;
                                const open = item.id === activeVersionId;
                                return (
                                    <Box key={item.id} sx={{ position: 'relative', pl: 3.5, minWidth: 0 }}>
                                        <Box sx={{
                                            position: 'absolute', left: 1, top: 17, width: 12, height: 12, borderRadius: '50%', zIndex: 1,
                                            bgcolor: current ? ws.ink : open ? ws.muted : '#4a4f55',
                                            boxShadow: `0 0 0 4px ${ws.page}`,
                                        }} />
                                        <Box sx={{
                                            display: 'flex', alignItems: 'center', gap: 1, p: 1.25, borderRadius: 2, minWidth: 0,
                                            border: '1px solid', borderColor: open ? ws.accentLine : ws.border,
                                            bgcolor: open ? ws.accentSoft : ws.card, transition: 'background-color .15s, border-color .15s',
                                            '&:hover': { borderColor: open ? ws.accentLine : ws.borderStrong },
                                        }}>
                                            <ButtonBase
                                                onClick={() => props.onLoadVersion(item.id)}
                                                aria-label={`Open version: ${item.comment || 'Blueprint update'}`}
                                                sx={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', borderRadius: 2 }}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                                    {current && (
                                                        <Box component="span" sx={{
                                                            px: 0.75, borderRadius: 1, fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                                                            bgcolor: ws.ink, color: '#16181a', flexShrink: 0,
                                                        }}>
                                                            CURRENT
                                                        </Box>
                                                    )}
                                                    <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: ws.ink }}>
                                                        {item.comment || 'Blueprint update'}
                                                    </Typography>
                                                </Box>
                                                <Typography noWrap sx={{ fontSize: 10.5, color: ws.faint, mt: 0.25 }}>
                                                    {item.user?.first_name ?? 'Someone'} · {dateTime(item.created_at)}
                                                </Typography>
                                            </ButtonBase>
                                            {!isViewer && !current && (
                                                <Button
                                                    size="small"
                                                    onClick={() => props.onRestoreVersion(item.id)}
                                                    sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: ws.ink, minWidth: 0, flexShrink: 0 }}
                                                >
                                                    Restore
                                                </Button>
                                            )}
                                            {item.user?.id === currentUserId && (
                                                confirmDeleteId === item.id ? (
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        onClick={() => { setConfirmDeleteId(null); props.onDeleteVersion(item.id); }}
                                                        onBlur={() => setConfirmDeleteId(null)}
                                                        autoFocus
                                                        sx={{ textTransform: 'none', fontSize: 12, fontWeight: 700, minWidth: 0, flexShrink: 0 }}
                                                    >
                                                        Sure?
                                                    </Button>
                                                ) : (
                                                    <Tooltip title="Delete this version">
                                                        <IconButton
                                                            size="small"
                                                            aria-label={`Delete version: ${item.comment || 'Blueprint update'}`}
                                                            onClick={() => setConfirmDeleteId(item.id)}
                                                            sx={{ color: ws.faint, flexShrink: 0, '&:hover': { color: 'error.main' } }}
                                                        >
                                                            <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}

                    {history.length > 5 && (
                        <Button
                            fullWidth
                            size="small"
                            onClick={() => setShowAllVersions((v) => !v)}
                            sx={{ mt: 1.5, textTransform: 'none', fontSize: 12, color: ws.muted }}
                        >
                            {showAllVersions ? 'Show fewer' : `Show all ${history.length}`}
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Footer */}
            <Box component="footer" sx={{
                flex: 'none', px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5,
                borderTop: `1px solid ${ws.border}`, bgcolor: ws.page, pb: 'max(12px, env(safe-area-inset-bottom))',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{
                        width: 30, height: 30, borderRadius: 1.5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: toneColor[syncTone], bgcolor: 'rgba(255, 255, 255, 0.07)', border: `1px solid ${ws.border}`,
                    }}>
                        {syncIcon(syncTone)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 12, fontWeight: 600, color: ws.ink, lineHeight: 1.25 }}>{toneWord[syncTone]}</Typography>
                        <Typography noWrap sx={{ fontSize: 10, color: ws.faint }}>{isViewer ? 'View only' : 'Draft saved to the cloud'}</Typography>
                    </Box>
                </Box>
                {!isViewer && (
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon sx={{ fontSize: 18 }} />}
                        onClick={props.onSave}
                        sx={{
                            textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: 1.5, px: 2, flexShrink: 0,
                            bgcolor: ws.ink, color: '#16181a', boxShadow: 'none',
                            '&:hover': { bgcolor: '#ffffff', boxShadow: 'none' },
                        }}
                    >
                        Save version
                    </Button>
                )}
            </Box>
        </>
    );
}
