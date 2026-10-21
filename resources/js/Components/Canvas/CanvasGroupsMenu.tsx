import React, { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import {
    Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle,
    Divider, IconButton, Menu, MenuItem, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import FolderOpenIcon from '@mui/icons-material/FolderOpenOutlined';
import { CanvasGroupRow, CanvasRow, ago, initialOf, ws } from './canvasWorkspace';

export type CanvasTab = 'all' | 'mine' | 'shared';
export type CanvasSort = 'recent' | 'name';
export type CanvasView = 'grid' | 'list';

interface Props {
    canvases: CanvasRow[];
    groups: CanvasGroupRow[];
    activeCanvasId: number;
    currentUserId: number;
    query: string;
    tab: CanvasTab;
    sort: CanvasSort;
    view: CanvasView;
    /** Creates a canvas in a group (null = General). */
    onCreateCanvas: (groupId: number | null) => void;
}

/** General holds your ungrouped canvases, Shared holds other people's. */
const GENERAL = 'general';
const SHARED = 'shared';
type GroupKey = number | typeof GENERAL | typeof SHARED;

const GROUP_MAX = 40;

const sectionTitleSx = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: ws.muted,
};

function CountPill({ n, active }: { n: number; active?: boolean }) {
    return (
        <Box component="span" sx={{
            px: 0.75, minWidth: 20, height: 18, borderRadius: 9, fontSize: 10.5, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums',
            bgcolor: active ? ws.ink : 'rgba(255, 255, 255, 0.09)', color: active ? '#16181a' : ws.muted,
        }}>
            {n}
        </Box>
    );
}

/** A group tile with two faint layers peeking out underneath: "there are many". */
function GroupTile({ name, note, count, selected, onClick }: {
    name: string; note: string; count: number; selected: boolean; onClick: () => void;
}) {
    const layer = (inset: number, depth: number, alpha: number) => ({
        content: '""', position: 'absolute' as const, left: inset, right: inset, bottom: -depth, height: 12,
        borderRadius: '0 0 12px 12px', border: '1px solid', borderTop: 0,
        borderColor: selected ? ws.accentLine : ws.border,
        bgcolor: `rgba(255, 255, 255, ${alpha})`,
    });

    return (
        <Box sx={{
            position: 'relative', mb: count > 1 ? 1.25 : 0,
            ...(count > 1 ? { '&::before': layer(7, 5, selected ? 0.16 : 0.08), '&::after': layer(14, 10, selected ? 0.1 : 0.05) } : {}),
        }}>
            <ButtonBase
                onClick={onClick}
                aria-pressed={selected}
                aria-label={`${name}, ${count} ${count === 1 ? 'canvas' : 'canvases'}`}
                sx={{
                    position: 'relative', zIndex: 1, width: '100%', display: 'block', textAlign: 'left',
                    p: 1.25, borderRadius: 2, border: '1px solid',
                    borderColor: selected ? ws.accentLine : ws.border,
                    bgcolor: selected ? ws.accentSoft : ws.card,
                    transition: 'background-color .15s, border-color .15s, transform .15s',
                    '&:hover': { bgcolor: selected ? ws.accentSoft : ws.cardHover },
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{
                        width: 26, height: 26, borderRadius: 2, fontSize: 13, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: selected ? ws.ink : 'rgba(255, 255, 255, 0.09)', color: selected ? '#16181a' : ws.muted,
                    }}>
                        {initialOf(name)}
                    </Box>
                    <CountPill n={count} active={selected} />
                </Box>
                <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700, color: ws.ink }}>{name}</Typography>
                <Typography noWrap sx={{ fontSize: 10.5, color: ws.faint }}>{note}</Typography>
            </ButtonBase>
        </Box>
    );
}

function CanvasTile({ canvas, active, mine, list, onOpen, onMenu }: {
    canvas: CanvasRow; active: boolean; mine: boolean; list: boolean;
    onOpen: () => void; onMenu: (el: HTMLElement) => void;
}) {
        const meta = mine ? ago(canvas.updated_at) : `by ${canvas.user?.first_name ?? 'a teammate'}`;
    const avatar = (
        <Box sx={{
            width: list ? 34 : 30, height: list ? 34 : 30, borderRadius: 2, fontSize: 13, fontWeight: 800, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: ws.muted, bgcolor: 'rgba(255, 255, 255, 0.07)', border: `1px solid ${ws.border}`,
        }}>
            {initialOf(canvas.title)}
        </Box>
    );

    return (
        <Box sx={{ position: 'relative' }}>
            <ButtonBase
                onClick={onOpen}
                aria-current={active ? 'true' : undefined}
                aria-label={`${canvas.title}${active ? ' (open)' : ''}`}
                sx={{
                    width: '100%', textAlign: 'left', borderRadius: 2, border: '1px solid',
                    borderColor: active ? ws.accentLine : ws.border,
                    bgcolor: active ? ws.accentSoft : ws.card,
                    transition: 'background-color .15s, border-color .15s, transform .15s',
                    '&:hover': { bgcolor: active ? ws.accentSoft : ws.cardHover, borderColor: active ? ws.accentLine : ws.borderStrong },
                    '&:active': { transform: 'scale(0.97)' },
                    ...(list
                        ? { display: 'flex', alignItems: 'center', gap: 1.25, p: 1, pr: mine ? 5 : 1.25 }
                        : { display: 'block', p: 1.25, pt: 1.25 }),
                }}
            >
                {list ? (
                    <>
                        {avatar}
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: ws.ink }}>{canvas.title}</Typography>
                            <Typography noWrap sx={{ fontSize: 11, color: ws.faint }}>{meta}</Typography>
                        </Box>
                        {active && <Typography sx={{ fontSize: 10, fontWeight: 600, color: ws.muted }}>OPEN</Typography>}
                    </>
                ) : (
                    <>
                        <Box sx={{ mb: 1.25 }}>{avatar}</Box>
                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 600, color: ws.ink }}>{canvas.title}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                            {active && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0 }} />}
                            <Typography noWrap sx={{ fontSize: 10.5, color: active ? ws.ink : ws.faint }}>
                                {active ? 'Open now' : meta}
                            </Typography>
                        </Box>
                    </>
                )}
            </ButtonBase>
            {mine && (
                <IconButton
                    size="small"
                    aria-label={`Options for ${canvas.title}`}
                    onClick={(e) => onMenu(e.currentTarget)}
                    sx={{
                        position: 'absolute', color: ws.muted, p: 0.5,
                        ...(list ? { top: '50%', right: 6, transform: 'translateY(-50%)' } : { top: 8, right: 6 }),
                        '&:hover': { color: ws.ink },
                    }}
                >
                    <MoreHorizIcon sx={{ fontSize: 18 }} />
                </IconButton>
            )}
        </Box>
    );
}

export default function CanvasGroupsMenu({ canvases, groups, activeCanvasId, currentUserId, query, tab, sort, view, onCreateCanvas }: Props) {
    const own = canvases.filter((c) => c.user_id === currentUserId);
    const shared = canvases.filter((c) => c.user_id !== currentUserId);

    const keyOf = (c: CanvasRow): GroupKey => {
        if (c.user_id !== currentUserId) return SHARED;
        return c.canvas_group_id && groups.some((g) => g.id === c.canvas_group_id) ? c.canvas_group_id : GENERAL;
    };

    const [selected, setSelected] = useState<GroupKey>(() => {
        const active = canvases.find((c) => c.id === activeCanvasId);
        return active ? keyOf(active) : GENERAL;
    });

    const tiles = useMemo(() => {
        const list: { key: GroupKey; name: string; real: boolean }[] = [];
        if (tab !== 'shared') {
            list.push({ key: GENERAL, name: 'General', real: false });
            groups.forEach((g) => list.push({ key: g.id, name: g.name, real: true }));
        }
        if (tab === 'shared' || (tab === 'all' && shared.length > 0)) list.push({ key: SHARED, name: 'Shared with me', real: false });
        return list;
    }, [groups, shared.length, tab]);

    const inGroup = (key: GroupKey) => (key === SHARED ? shared : own.filter((c) => keyOf(c) === key));
    const shownKey: GroupKey = tiles.some((t) => t.key === selected) ? selected : tiles[0].key;
    const shownTile = tiles.find((t) => t.key === shownKey)!;

    const needle = query.trim().toLowerCase();
    const searching = needle !== '';
    const order = (list: CanvasRow[]) => [...list].sort((a, b) => sort === 'name'
        ? a.title.localeCompare(b.title)
        : (b.updated_at ?? '').localeCompare(a.updated_at ?? '') || b.id - a.id);

    const pool = tab === 'mine' ? own : tab === 'shared' ? shared : canvases;
    const shown = searching
        ? order(pool.filter((c) => c.title.toLowerCase().includes(needle)))
        : order(inGroup(shownKey));

    // Dialogs and menus
    const [nameDialog, setNameDialog] = useState<{ mode: 'create' | 'rename'; id?: number } | null>(null);
    const [name, setName] = useState('');
    const [groupMenu, setGroupMenu] = useState<HTMLElement | null>(null);
    const [canvasMenu, setCanvasMenu] = useState<{ el: HTMLElement; canvas: CanvasRow } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [canvasToDelete, setCanvasToDelete] = useState<CanvasRow | null>(null);

    const openName = (mode: 'create' | 'rename', id?: number, current = '') => {
        setName(current);
        setNameDialog({ mode, id });
    };

    const submitName = () => {
        const value = name.trim();
        if (!value || !nameDialog) return;
        const done = { preserveScroll: true, onSuccess: () => setNameDialog(null) };
        if (nameDialog.mode === 'create') router.post('/canvas/groups', { name: value }, done);
        else router.post(`/canvas/groups/${nameDialog.id}`, { name: value }, done);
    };

    const deleteGroup = () => {
        if (typeof shownKey !== 'number') return;
        router.delete(`/canvas/groups/${shownKey}`, {
            preserveScroll: true,
            onSuccess: () => { setConfirmDelete(false); setSelected(GENERAL); },
        });
    };

    const moveCanvas = (canvas: CanvasRow, groupId: number | null) => {
        setCanvasMenu(null);
        router.post(`/canvas/${canvas.id}/move`, { group_id: groupId }, {
            preserveScroll: true,
            onSuccess: () => setSelected(groupId ?? GENERAL),
        });
    };

    // Only the owner's own canvases offer this; the server refuses anyone else.
    const deleteCanvas = () => {
        if (!canvasToDelete) return;
        router.delete(route('admin.canvas.destroy', canvasToDelete.id), {
            preserveScroll: true,
            onSuccess: () => setCanvasToDelete(null),
            onFinish: () => setCanvasToDelete(null),
        });
    };

    const switchTo = (id: number) => {
        if (id !== activeCanvasId) router.get('/canvas', { canvas_id: id });
    };

    const noteFor = (key: GroupKey, count: number) => key === GENERAL ? 'Your canvases'
        : key === SHARED ? 'From teammates'
        : `${count} ${count === 1 ? 'canvas' : 'canvases'}`;

    const gridSx = view === 'list'
        ? { display: 'flex', flexDirection: 'column' as const, gap: 1 }
        : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 1.25 };

    const canCreate = !searching && shownKey !== SHARED;

    return (
        <Box>
            {!searching && (
                <Box component="section" aria-label="Groups" sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                        <Typography sx={sectionTitleSx}>Groups</Typography>
                        {tab !== 'shared' && (
                            <Button
                                size="small"
                                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                                onClick={() => openName('create')}
                                sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: ws.ink, minWidth: 0, py: 0.25 }}
                            >
                                New group
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 1.25 }}>
                        {tiles.map((t) => {
                            const n = inGroup(t.key).length;
                            return (
                                <GroupTile
                                    key={String(t.key)}
                                    name={t.name}
                                    note={noteFor(t.key, n)}
                                    count={n}
                                    selected={t.key === shownKey}
                                    onClick={() => setSelected(t.key)}
                                />
                            );
                        })}
                    </Box>
                </Box>
            )}

            <Box component="section" aria-label="Canvases">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, minHeight: 28 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Typography noWrap sx={sectionTitleSx}>{searching ? 'Results' : shownTile.name}</Typography>
                        <CountPill n={shown.length} />
                    </Box>
                    {!searching && shownTile.real && (
                        <IconButton size="small" aria-label="Group options" onClick={(e) => setGroupMenu(e.currentTarget)} sx={{ color: ws.muted }}>
                            <MoreVertIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>

                {shown.length === 0 && !canCreate ? (
                    <Box sx={{ py: 4, textAlign: 'center', color: ws.faint }}>
                        <FolderOpenIcon sx={{ fontSize: 28, mb: 0.5 }} />
                        <Typography sx={{ fontSize: 12.5 }}>
                            {searching ? `No canvas matches "${query.trim()}".` : 'Nothing shared with you yet.'}
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={gridSx}>
                        {shown.map((c) => (
                            <CanvasTile
                                key={c.id}
                                canvas={c}
                                active={c.id === activeCanvasId}
                                mine={c.user_id === currentUserId}
                                list={view === 'list'}
                                onOpen={() => switchTo(c.id)}
                                onMenu={(el) => setCanvasMenu({ el, canvas: c })}
                            />
                        ))}
                        {canCreate && (
                            <ButtonBase
                                onClick={() => onCreateCanvas(typeof shownKey === 'number' ? shownKey : null)}
                                aria-label="New canvas"
                                sx={{
                                    borderRadius: 2, border: '1px dashed', borderColor: ws.borderStrong,
                                    color: ws.muted, gap: 1,
                                    minHeight: view === 'list' ? 52 : 92,
                                    flexDirection: view === 'list' ? 'row' : 'column',
                                    transition: 'background-color .15s, transform .15s',
                                    '&:hover': { bgcolor: ws.accentSoft, color: ws.ink },
                                }}
                            >
                                <AddIcon sx={{ fontSize: 20 }} />
                                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>New canvas</Typography>
                            </ButtonBase>
                        )}
                    </Box>
                )}
            </Box>

            {/* Group options */}
            <Menu anchorEl={groupMenu} open={Boolean(groupMenu)} onClose={() => setGroupMenu(null)}>
                <MenuItem onClick={() => { setGroupMenu(null); openName('rename', shownKey as number, shownTile.name); }}>Rename group</MenuItem>
                <MenuItem sx={{ color: 'error.main' }} onClick={() => { setGroupMenu(null); setConfirmDelete(true); }}>Delete group</MenuItem>
            </Menu>

            {/* Move a canvas */}
            <Menu anchorEl={canvasMenu?.el} open={Boolean(canvasMenu)} onClose={() => setCanvasMenu(null)}>
                <Typography sx={{ ...sectionTitleSx, px: 2, py: 0.5 }}>Move to</Typography>
                <MenuItem disabled={canvasMenu ? keyOf(canvasMenu.canvas) === GENERAL : false} onClick={() => canvasMenu && moveCanvas(canvasMenu.canvas, null)}>
                    General
                </MenuItem>
                {groups.map((g) => (
                    <MenuItem key={g.id} disabled={canvasMenu ? keyOf(canvasMenu.canvas) === g.id : false} onClick={() => canvasMenu && moveCanvas(canvasMenu.canvas, g.id)}>
                        {g.name}
                    </MenuItem>
                ))}
                {canvasMenu?.canvas.user_id === currentUserId && <Divider sx={{ my: 0.5 }} />}
                {canvasMenu?.canvas.user_id === currentUserId && (
                    <MenuItem sx={{ color: 'error.main' }} onClick={() => { setCanvasToDelete(canvasMenu.canvas); setCanvasMenu(null); }}>
                        Delete canvas
                    </MenuItem>
                )}
            </Menu>

            <Dialog open={Boolean(nameDialog)} onClose={() => setNameDialog(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold' }}>{nameDialog?.mode === 'rename' ? 'Rename group' : 'New group'}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Group name"
                        fullWidth
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, GROUP_MAX))}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitName(); }}
                        helperText={`${name.length}/${GROUP_MAX}`}
                        FormHelperTextProps={{ sx: { textAlign: 'right' } }}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setNameDialog(null)} color="inherit">Cancel</Button>
                    <Button onClick={submitName} variant="contained" disabled={!name.trim()}>
                        {nameDialog?.mode === 'rename' ? 'Rename' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(canvasToDelete)} onClose={() => setCanvasToDelete(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold' }}>Delete canvas</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                        Delete <strong>{canvasToDelete?.title}</strong> and all of its saved versions? Anyone it is shared with loses it too. This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setCanvasToDelete(null)} color="inherit">Cancel</Button>
                    <Button onClick={deleteCanvas} variant="contained" color="error">Delete canvas</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold' }}>Delete group</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                        Delete <strong>{shownTile.name}</strong>? Its canvases are not deleted; they move to General.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setConfirmDelete(false)} color="inherit">Cancel</Button>
                    <Button onClick={deleteGroup} variant="contained" color="error">Delete group</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
