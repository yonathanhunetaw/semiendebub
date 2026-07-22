import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Head, router } from '@inertiajs/react';
import axios from 'axios';
import {
    ThemeProvider,
    createTheme,
    Box,
    Button,
    Select,
    MenuItem,
    TextField,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Drawer,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    Tooltip,
    Snackbar,
    Alert,
    Fab,
    FormControl,
    InputLabel,
    ListSubheader
} from '@mui/material';
import {
    Menu as MenuIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Save as SaveIcon,
    History as HistoryIcon,
    Person as PersonIcon,
    AccessTime as AccessTimeIcon,
    Close as CloseIcon
} from '@mui/icons-material';

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#3b82f6',
        },
        secondary: {
            main: '#8b5cf6',
        },
        background: {
            default: '#f8fafc',
            paper: '#ffffff',
        }
    },
    typography: {
        fontFamily: '"Poppins", "Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    }
});

interface HistoryItem {
    id: number;
    comment: string;
    created_at: string;
    user?: {
        id: number;
        first_name: string;
        last_name: string;
    };
}

interface CanvasProps {
    canvases: any[];
    activeCanvasId: number;
    currentUserId: number;
    allUsers: any[];
    sharedUsers?: any[];
    latestSnapshot: any;
    latestVersionInfo?: {
        id: number;
        user?: {
            id: number;
            first_name: string;
            last_name: string;
        };
        created_at: string;
    };
    history: HistoryItem[];
}

const customAssetStore: any = {
    async upload(_asset: any, file: File): Promise<{ src: string }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post('/canvas/upload-asset', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        const url = response.data?.url;
        if (typeof url !== 'string' || url.length === 0) {
            console.error('Canvas image upload returned an invalid response:', response.data);
            throw new Error(response.data?.error || 'Canvas image upload did not return a URL.');
        }

        return { src: url };
    },
    async resolve(asset: any): Promise<string> {
        return asset.props?.src ?? '';
    }
};

export default function Canvas({ canvases, activeCanvasId: initialActiveCanvasId, currentUserId, allUsers, sharedUsers: initialSharedUsers, latestSnapshot, latestVersionInfo, history: initialHistory }: CanvasProps) {

    const getSanitizedSnapshot = (rawData: any): any => {
        if (!rawData) return undefined;

        let clean = rawData;
        if (typeof clean === 'string') {
            try { clean = JSON.parse(clean); } catch (e) { }
        }
        if (clean && clean.snapshot_json) {
            clean = clean.snapshot_json;
        }
        if (typeof clean === 'string') {
            try { clean = JSON.parse(clean); } catch (e) { }
        }

        const finalDoc = clean.document || clean;

        let mutableDoc;
        try {
            mutableDoc = typeof structuredClone === 'function' 
                ? structuredClone(finalDoc) 
                : JSON.parse(JSON.stringify(finalDoc));
        } catch (e) {
            mutableDoc = JSON.parse(JSON.stringify(finalDoc));
        }

        if (mutableDoc && mutableDoc.store) {
            Object.values(mutableDoc.store).forEach((record: any) => {
                if (!record || typeof record !== 'object') return;

                if (record.typeName === 'shape' && record.props) {
                    if ('url' in record.props && (record.props.url === null || record.props.url === undefined)) {
                        record.props.url = '';
                    }

                    if (record.type === 'embed') {
                        const allowedEmbedProps = new Set(['w', 'h', 'url']);
                        Object.keys(record.props).forEach(key => {
                            if (!allowedEmbedProps.has(key)) {
                                delete record.props[key];
                            }
                        });
                        if (record.props.url === null || record.props.url === undefined) record.props.url = '';
                    }

                    if (record.type === 'image') {
                        const allowedImageProps = new Set(['w', 'h', 'playing', 'url', 'assetId', 'crop', 'flipX', 'flipY', 'altText']);
                        Object.keys(record.props).forEach(key => {
                            if (!allowedImageProps.has(key)) {
                                delete record.props[key];
                            }
                        });

                        if (record.props.altText === undefined || record.props.altText === null) {
                            record.props.altText = '';
                        }
                        if (record.props.url === null || record.props.url === undefined) record.props.url = '';
                        if (record.props.assetId === undefined) record.props.assetId = null;
                        if (record.props.crop === undefined) record.props.crop = null;
                        if (record.props.playing === undefined) record.props.playing = true;
                        if (record.props.flipX === undefined) record.props.flipX = false;
                        if (record.props.flipY === undefined) record.props.flipY = false;
                    }
                }

                if (record.typeName === 'asset') {
                    if (!record.props) {
                        record.props = {};
                    }
                    if (record.props.src === null || record.props.src === undefined) {
                        record.props.src = '';
                    }
                    if (typeof record.props.src === 'object') {
                        record.props.src = (record.props.src as any)?.src ?? '';
                    }
                }

                if (record.typeName === 'user') {
                    if (record.imageUrl === null || record.imageUrl === undefined) {
                        record.imageUrl = '';
                    }
                }

                if (record.name === null || record.name === undefined) {
                    if (record.typeName === 'document') record.name = 'Canvas';
                    else if (record.typeName === 'user') record.name = 'Admin';
                    else if (record.typeName === 'page') record.name = 'Page';
                    else if ('name' in record) record.name = '';
                }
            });
        }

        return mutableDoc;
    };

    const editorRef = useRef<Editor | null>(null);
    const tldrawKey = 'canvas-root';

    const [history, setHistory] = useState<HistoryItem[]>(initialHistory || []);
    const [activeVersionId, setActiveVersionId] = useState<number | null>(latestVersionInfo?.id || null);
    
    // MUI Specific State
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<any>(null); // For deletion confirmation
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    const [newCanvasTitle, setNewCanvasTitle] = useState('');
    const [selectedUserToShare, setSelectedUserToShare] = useState('');
    const [sharedUsers, setSharedUsers] = useState<any[]>(initialSharedUsers || []);
    
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = ''; // Standard way to show browser's native dialog
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        const unsubscribe = router.on('before', (event) => {
            if (hasUnsavedChanges) {
                if (!window.confirm('You have unsaved changes. Are you sure you want to leave this canvas without saving?')) {
                    event.preventDefault();
                }
            }
        });

        return unsubscribe;
    }, [hasUnsavedChanges]);

    const handleCreateCanvas = () => {
        if (!newCanvasTitle.trim()) return;
        router.post('/canvas/create', { title: newCanvasTitle }, {
            onSuccess: () => {
                setNewCanvasTitle('');
                setIsCreateDialogOpen(false);
                setIsDrawerOpen(false);
                setSnackbar({ open: true, message: 'Canvas created successfully!', severity: 'success' });
            }
        });
    };

    const handleShareCanvas = () => {
        if (!selectedUserToShare) return;
        const sharedUser = allUsers?.find((u: any) => String(u.id) === String(selectedUserToShare));
        router.post('/canvas/share', { 
            canvas_id: initialActiveCanvasId, 
            user_id: selectedUserToShare 
        }, {
            onSuccess: () => {
                if (sharedUser) {
                    setSharedUsers(prev => (
                        prev.some(u => String(u.id) === String(sharedUser.id)) ? prev : [...prev, sharedUser]
                    ));
                }
                setSelectedUserToShare('');
                setSnackbar({ open: true, message: 'Canvas shared successfully!', severity: 'success' });
            }
        });
    };

    const handleConfirmUnshare = () => {
        if (!userToDelete) return;
        router.post('/canvas/unshare', {
            canvas_id: initialActiveCanvasId,
            user_id: userToDelete.id,
        }, {
            onSuccess: () => {
                setSharedUsers(prev => prev.filter(u => String(u.id) !== String(userToDelete.id)));
                setUserToDelete(null);
                setSnackbar({ open: true, message: 'User access removed.', severity: 'success' });
            }
        });
    };

    const stableInitialSnapshot = useMemo(() => {
        return getSanitizedSnapshot(latestSnapshot);
    }, [latestSnapshot]);

    const handleMount = (editor: Editor) => {
        editorRef.current = editor;
        (window as any).editor = editor;

        editor.store.listen((update) => {
            if (update.source !== 'user') return;
            
            const changedRecords = [
                ...Object.values(update.changes.added),
                ...Object.values(update.changes.updated).map(([_, to]) => to),
                ...Object.values(update.changes.removed)
            ];
            
            const isSignificantChange = changedRecords.some((r: any) => 
                r.typeName === 'shape' || r.typeName === 'asset' || r.typeName === 'page'
            );
            
            if (isSignificantChange) {
                setHasUnsavedChanges(true);
            }
        });

        try {
            const allRecords = Object.values(editor.store.allRecords());
            const userPatches = allRecords
                .filter((r: any) => r.typeName === 'user' && (r.imageUrl === null || r.imageUrl === undefined))
                .map((r: any) => ({ ...r, imageUrl: '' }));
            if (userPatches.length > 0) {
                editor.store.put(userPatches);
            }
        } catch (e) {
            console.warn('Could not patch user imageUrl records:', e);
        }

        setTimeout(() => {
            editor.zoomToFit({ animation: { duration: 200 } });
        }, 150);
    };

    const handleSave = async () => {
        const editor = editorRef.current;
        if (!editor) return;

        const comment = prompt('Enter a comment for this save:', 'Updated canvas blueprint') || 'Submitted for review';

        try {
            const snapshot = getSanitizedSnapshot(editor.getSnapshot());
            const response = await axios.post('/canvas/save', {
                canvas_id: initialActiveCanvasId,
                snapshot_json: snapshot,
                comment,
            });

            if (response.status === 200) {
                setSnackbar({ open: true, message: 'Canvas snapshot saved!', severity: 'success' });
                setIsDrawerOpen(false);
                setHasUnsavedChanges(false);

                const newVersionId = response.data.version_id;
                setHistory(prev => [
                    { id: newVersionId, comment, created_at: new Date().toISOString() },
                    ...prev,
                ]);
                setActiveVersionId(newVersionId);
            }
        } catch (error) {
            console.error('Failed to save canvas data:', error);
            setSnackbar({ open: true, message: 'Save failed — check console.', severity: 'error' });
        }
    };

    const handleLoadVersion = async (id: number) => {
        const editor = editorRef.current;
        if (!editor) return;

        try {
            const response = await axios.get(`/canvas/version/${id}`);
            if (response.data) {
                const sanitized = getSanitizedSnapshot(response.data);
                if (sanitized) {
                    editor.loadSnapshot(sanitized);
                    setTimeout(() => editor.zoomToFit({ animation: { duration: 200 } }), 100);
                }
                setActiveVersionId(id);
                setIsDrawerOpen(false);
                setHasUnsavedChanges(false);
                setSnackbar({ open: true, message: `Loaded version ${id}`, severity: 'success' });
            }
        } catch (error: any) {
            console.error('Failed to load snapshot version:', error);
            alert(`Could not open this canvas version entry: ${error?.message || 'Unknown error'}`);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default' }}>
                <Head title="Canvas Admin" />

                <Tldraw
                    key={tldrawKey}
                    snapshot={stableInitialSnapshot}
                    assets={customAssetStore}
                    onMount={handleMount}
                    components={{ 
                        DebugMenu: null,
                        SharePanel: () => {
                            const activeCanvas = canvases.find(c => c.id === initialActiveCanvasId);
                            return (
                                <Box sx={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 1.5, mr: 1, my: 1.5 }}>
                                    {activeCanvas && (
                                        <Box sx={{ bgcolor: 'background.paper', px: 2, py: 0.75, borderRadius: 2, boxShadow: 1, border: '1px solid', borderColor: 'divider' }}>
                                            <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ lineHeight: 1 }}>
                                                {activeCanvas.title}
                                            </Typography>
                                        </Box>
                                    )}
                                    <Tooltip title="Create New Canvas">
                                        <IconButton
                                            onClick={() => setIsCreateDialogOpen(true)}
                                            sx={{
                                                width: 40, height: 40,
                                                bgcolor: 'primary.main', color: 'white',
                                                boxShadow: 2,
                                                '&:hover': { bgcolor: 'primary.dark' },
                                            }}
                                        >
                                            <AddIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Admin Menu">
                                        <IconButton
                                            onClick={() => setIsDrawerOpen(true)}
                                            sx={{
                                                width: 40, height: 40,
                                                bgcolor: '#e2e8f0', color: '#1e293b',
                                                boxShadow: 2,
                                                '&:hover': { bgcolor: '#cbd5e1' },
                                            }}
                                        >
                                            <MenuIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            );
                        }
                    }}
                />

                {/* Right Side Drawer for Admin Settings */}
                <Drawer 
                    anchor="right" 
                    open={isDrawerOpen} 
                    onClose={() => setIsDrawerOpen(false)} 
                    PaperProps={{ sx: { width: { xs: '100%', sm: 360 } } }}
                >
                    <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="h6" fontWeight="bold">Canvas Admin</Typography>
                        <IconButton onClick={() => setIsDrawerOpen(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    <Divider />
                    
                    <Box sx={{ p: 2.5 }}>
                        <FormControl fullWidth size="small" sx={{ mb: 4 }}>
                            <InputLabel>Active Canvas</InputLabel>
                            <Select
                                value={initialActiveCanvasId}
                                label="Active Canvas"
                                onChange={(e) => router.get('/canvas', { canvas_id: e.target.value })}
                            >
                                <ListSubheader sx={{ fontWeight: 'bold', color: 'primary.main', lineHeight: '36px' }}>My Canvases</ListSubheader>
                                {canvases.filter(c => c.user_id === currentUserId).map(c => (
                                    <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>
                                ))}

                                {canvases.filter(c => c.user_id !== currentUserId).length > 0 && [
                                    <ListSubheader key="shared-header" sx={{ fontWeight: 'bold', color: 'secondary.main', lineHeight: '36px' }}>Shared with me</ListSubheader>,
                                    ...canvases.filter(c => c.user_id !== currentUserId).map(c => (
                                        <MenuItem key={c.id} value={c.id}>
                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                <span>{c.title}</span>
                                                <Typography variant="caption" color="text.secondary">
                                                    by {c.user?.first_name} {c.user?.last_name}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))
                                ]}
                            </Select>
                        </FormControl>

                        <Typography variant="subtitle2" color="text.secondary" fontWeight="bold" sx={{ mb: 1.5, textTransform: 'uppercase' }}>
                            Sharing Settings
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Share with user...</InputLabel>
                                <Select
                                    value={selectedUserToShare}
                                    label="Share with user..."
                                    onChange={e => setSelectedUserToShare(e.target.value as string)}
                                >
                                    {allUsers
                                        ?.filter((u: any) => !sharedUsers.some(su => String(su.id) === String(u.id)))
                                        .map((u: any) => (
                                            <MenuItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                            <Button 
                                variant="contained" 
                                color="success" 
                                disabled={!selectedUserToShare}
                                onClick={handleShareCanvas}
                                sx={{ minWidth: 80, textTransform: 'none' }}
                            >
                                Share
                            </Button>
                        </Box>

                        {sharedUsers.length > 0 ? (
                            <List dense sx={{ bgcolor: 'background.default', borderRadius: 1, border: '1px solid #e2e8f0', mb: 4 }}>
                                {sharedUsers.map((u: any) => (
                                    <ListItem 
                                        key={u.id}
                                        secondaryAction={
                                            <Tooltip title="Remove access">
                                                <IconButton edge="end" size="small" color="error" onClick={() => setUserToDelete(u)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        }
                                    >
                                        <ListItemAvatar sx={{ minWidth: 40 }}>
                                            <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.light' }}>
                                                <PersonIcon fontSize="small" />
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText primary={`${u.first_name} ${u.last_name}`} />
                                    </ListItem>
                                ))}
                            </List>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 4, fontStyle: 'italic' }}>
                                Not shared with anyone yet.
                            </Typography>
                        )}

                        <Button 
                            variant="contained" 
                            color="warning" 
                            fullWidth 
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            sx={{ py: 1.5, fontWeight: 'bold', textTransform: 'none' }}
                            disableElevation
                        >
                            Save Canvas Snapshot
                        </Button>
                    </Box>
                    
                    <Divider />

                    <List
                        subheader={
                            <ListSubheader sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, lineHeight: 'normal', bgcolor: 'background.paper', fontWeight: 'bold' }}>
                                <HistoryIcon fontSize="small" /> VERSION HISTORY
                            </ListSubheader>
                        }
                        sx={{ flex: 1, overflowY: 'auto' }}
                    >
                        {history.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" align="center" sx={{ p: 4 }}>
                                No saves yet.
                            </Typography>
                        ) : (
                            history.map((item) => {
                                const isActive = activeVersionId === item.id;
                                return (
                                    <ListItem 
                                        key={item.id} 
                                        disablePadding
                                        sx={{ 
                                            bgcolor: isActive ? 'primary.50' : 'transparent',
                                            borderBottom: '1px solid #f8fafc'
                                        }}
                                    >
                                        <Button 
                                            fullWidth 
                                            sx={{ 
                                                justifyContent: 'flex-start', 
                                                textAlign: 'left', 
                                                p: 2, 
                                                color: 'text.primary',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'flex-start',
                                                textTransform: 'none'
                                            }}
                                            onClick={() => handleLoadVersion(item.id)}
                                        >
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 0.5 }}>
                                                <Typography variant="subtitle2" fontWeight="bold" color={isActive ? 'primary.main' : 'text.primary'}>
                                                    v{item.id}
                                                </Typography>
                                                {isActive && (
                                                    <Box sx={{ bgcolor: 'primary.main', color: 'white', px: 1, borderRadius: 10, fontSize: '0.65rem', fontWeight: 'bold' }}>
                                                        ACTIVE
                                                    </Box>
                                                )}
                                            </Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                {item.comment || 'No comment'}
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                                {item.user && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.disabled' }}>
                                                        <PersonIcon sx={{ fontSize: 14 }} />
                                                        <Typography variant="caption">{item.user.first_name} {item.user.last_name}</Typography>
                                                    </Box>
                                                )}
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.disabled' }}>
                                                    <AccessTimeIcon sx={{ fontSize: 14 }} />
                                                    <Typography variant="caption">{formatDate(item.created_at)}</Typography>
                                                </Box>
                                            </Box>
                                        </Button>
                                    </ListItem>
                                );
                            })
                        )}
                    </List>
                </Drawer>

                {/* Create Canvas Dialog */}
                <Dialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle fontWeight="bold">Create New Canvas</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Canvas Title"
                            type="text"
                            fullWidth
                            variant="outlined"
                            value={newCanvasTitle}
                            onChange={(e) => setNewCanvasTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCanvas(); }}
                            sx={{ mt: 1 }}
                        />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setIsCreateDialogOpen(false)} color="inherit">Cancel</Button>
                        <Button onClick={handleCreateCanvas} variant="contained" disableElevation disabled={!newCanvasTitle.trim()}>Create</Button>
                    </DialogActions>
                </Dialog>

                {/* Confirm Delete Shared User Dialog */}
                <Dialog open={Boolean(userToDelete)} onClose={() => setUserToDelete(null)} maxWidth="xs" fullWidth>
                    <DialogTitle fontWeight="bold">Remove Access?</DialogTitle>
                    <DialogContent>
                        <Typography>
                            Are you sure you want to remove <strong>{userToDelete?.first_name} {userToDelete?.last_name}</strong> from this canvas? They will no longer be able to view or edit it.
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setUserToDelete(null)} color="inherit">Cancel</Button>
                        <Button onClick={handleConfirmUnshare} color="error" variant="contained" disableElevation>Remove</Button>
                    </DialogActions>
                </Dialog>

                {/* Global Snackbar Alerts */}
                <Snackbar 
                    open={snackbar.open} 
                    autoHideDuration={4000} 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert 
                        onClose={() => setSnackbar({ ...snackbar, open: false })} 
                        severity={snackbar.severity} 
                        sx={{ width: '100%', boxShadow: 3 }}
                        elevation={6}
                        variant="filled"
                    >
                        {snackbar.message}
                    </Alert>
                </Snackbar>

            </Box>
        </ThemeProvider>
    );
}