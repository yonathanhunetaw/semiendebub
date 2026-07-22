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
    Close as CloseIcon,
    CameraAlt,
    Layers,
    Share,
    Draw,
    PersonAdd
} from '@mui/icons-material';

const theme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#3525cd',
            light: '#4f46e5',
            dark: '#0f0069',
        },
        secondary: {
            main: '#6063ee',
        },
        background: {
            default: '#f9f9ff',
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
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<any>(null); // For deletion confirmation
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    const [newCanvasTitle, setNewCanvasTitle] = useState('');
    const [selectedUserToShare, setSelectedUserToShare] = useState('');
    const [selectedPermission, setSelectedPermission] = useState<'view'|'edit'>('edit');
    const [sharedUsers, setSharedUsers] = useState<any[]>(initialSharedUsers || []);
    
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const isFirstMount = useRef(true);
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
        } else {
            setSnackbar({ open: true, message: 'Canvas switched successfully', severity: 'success' });
        }
    }, [initialActiveCanvasId]);

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
            user_id: selectedUserToShare,
            permission: selectedPermission
        }, {
            onSuccess: () => {
                if (sharedUser) {
                    const userWithPivot = { ...sharedUser, pivot: { permission: selectedPermission } };
                    setSharedUsers(prev => (
                        prev.some(u => String(u.id) === String(sharedUser.id)) 
                            ? prev.map(u => String(u.id) === String(sharedUser.id) ? userWithPivot : u) 
                            : [...prev, userWithPivot]
                    ));
                }
                setSelectedUserToShare('');
                setSelectedPermission('edit');
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

    const activeCanvas = canvases.find(c => c.id === initialActiveCanvasId);
    const isOwner = activeCanvas?.user_id === currentUserId;
    const currentUserShare = sharedUsers.find((u: any) => String(u.id) === String(currentUserId));
    const isViewer = !isOwner && currentUserShare?.pivot?.permission === 'view';

    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.updateInstanceState({ isReadonly: isViewer });
        }
    }, [isViewer]);

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
                                    <style>{`
                                        @keyframes popInOut {
                                            0%, 100% { transform: scale(1); opacity: 1; }
                                            50% { transform: scale(0.85); opacity: 0; }
                                        }
                                    `}</style>
                                    {activeCanvas && (
                                        <Box 
                                            key={activeCanvas.id}
                                            sx={{ 
                                                bgcolor: 'background.paper', px: 2, py: 0.75, borderRadius: 2, boxShadow: 1, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column',
                                                animation: 'popInOut 0.35s ease-in-out 3'
                                            }}
                                        >
                                            <Typography variant="body2" fontWeight="bold" color="text.primary" sx={{ lineHeight: 1.2 }}>
                                                {activeCanvas.title}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '10px' }}>
                                                Owned by {activeCanvas.user_id === currentUserId ? 'you' : (activeCanvas.user?.first_name || 'Admin')}
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
                    PaperProps={{ sx: { width: { xs: '100%', md: 800 }, bgcolor: '#f9f9ff' } }}
                >
                    <Box sx={{ p: { xs: 3, md: 4 } }}>
                        {/* 1. Header Section */}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 3 }}>
                            <Button 
                                onClick={() => setIsDrawerOpen(false)}
                                sx={{ bgcolor: '#e2dfff', color: '#3525cd', px: 2, py: 1, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: '#c9c4ff' } }}
                                startIcon={<CloseIcon />}
                            >
                                <Typography sx={{ fontSize: '13px', fontWeight: 700 }}>Close Drawer</Typography>
                            </Button>
                        </Box>

                        {/* Bento Grid */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' }, gap: 3 }}>
                            
                            {/* 2. Active Canvas Card */}
                            <Box sx={{ gridColumn: { xs: 'span 1', md: 'span 8' }, bgcolor: '#fff', border: '1px solid #c7c4d8', borderRadius: 3, p: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', justifyContent: 'space-between', gap: 2, transition: 'all 0.2s', '&:hover': { borderColor: '#4f46e5', boxShadow: '0 4px 12px -2px rgba(79, 70, 229, 0.08)' } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ width: 64, height: 64, borderRadius: 3, bgcolor: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Draw sx={{ fontSize: 32 }} />
                                    </Box>
                                    <Box>
                                        <Typography sx={{ fontSize: '20px', fontWeight: 600, color: '#111c2d' }}>
                                            {canvases.find(c => c.id === initialActiveCanvasId)?.title || 'Canvas'}
                                        </Typography>
                                        <Typography sx={{ fontSize: '14px', color: '#464555' }}>
                                            Owned by {canvases.find(c => c.id === initialActiveCanvasId)?.user_id === currentUserId ? 'You' : canvases.find(c => c.id === initialActiveCanvasId)?.user?.first_name || 'Admin'}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
                                    <Typography sx={{ fontSize: '10px', fontWeight: 700, color: '#464555', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>Selected White Board</Typography>
                                    <FormControl size="small" sx={{ minWidth: 180 }}>
                                        <Select
                                            value={initialActiveCanvasId}
                                            onChange={(e) => router.get('/canvas', { canvas_id: e.target.value }, { onSuccess: () => setSnackbar({ open: true, message: 'Canvas loaded successfully!', severity: 'success' }) })}
                                            displayEmpty
                                            renderValue={(selected) => {
                                                const c = canvases.find(cv => cv.id === selected);
                                                if (!c) return '';
                                                if (c.user_id !== currentUserId) {
                                                    return (
                                                        <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, py: 0.5 }}>
                                                            <span style={{ fontSize: '14px' }}>{c.title}</span>
                                                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', fontWeight: 'normal' }}>by {c.user?.first_name} {c.user?.last_name}</span>
                                                        </Box>
                                                    );
                                                }
                                                return <span style={{ fontSize: '14px', paddingBottom: '2px', paddingTop: '2px' }}>{c.title}</span>;
                                            }}
                                            sx={{ 
                                                bgcolor: '#3525cd', color: '#fff', borderRadius: 2, fontWeight: 600,
                                                '& .MuiSelect-icon': { color: '#fff' }, 
                                                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                                '&:hover': { bgcolor: '#2b1da8' }
                                            }}
                                        >
                                            <ListSubheader sx={{ fontWeight: 'bold', color: '#3525cd', lineHeight: '36px' }}>My Canvases</ListSubheader>
                                            {canvases.filter(c => c.user_id === currentUserId).map(c => (
                                                <MenuItem key={c.id} value={c.id}>{c.title}</MenuItem>
                                            ))}

                                            {canvases.filter(c => c.user_id !== currentUserId).length > 0 && [
                                                <ListSubheader key="shared-header" sx={{ fontWeight: 'bold', color: '#6063ee', lineHeight: '36px' }}>Shared with me</ListSubheader>,
                                                ...canvases.filter(c => c.user_id !== currentUserId).map(c => (
                                                    <MenuItem key={c.id} value={c.id}>
                                                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span>{c.title}</span>
                                                            <Typography variant="caption" sx={{ color: '#464555' }}>
                                                                by {c.user?.first_name} {c.user?.last_name}
                                                            </Typography>
                                                        </Box>
                                                    </MenuItem>
                                                ))
                                            ]}
                                        </Select>
                                    </FormControl>
                                </Box>
                            </Box>

                            {/* 3. Snapshot Action */}
                            <Box sx={{ gridColumn: { xs: 'span 1', md: 'span 4' }, bgcolor: '#263143', borderRadius: 3, p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                <Box sx={{ mb: 2 }}>
                                    <CameraAlt sx={{ fontSize: 48, color: '#e2dfff' }} />
                                </Box>
                                <Typography sx={{ fontSize: '20px', fontWeight: 600, color: '#fff', mb: 0.5 }}>Save State</Typography>
                                <Typography sx={{ fontSize: '14px', color: '#c7c4d8', mb: 3 }}>Preserve current configuration.</Typography>
                                <Button 
                                    onClick={handleSave}
                                    fullWidth
                                    sx={{ bgcolor: '#4f46e5', color: '#dad7ff', py: 1.5, borderRadius: 2, fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', '&:hover': { bgcolor: '#3525cd' } }}
                                >
                                    Snapshot
                                </Button>
                            </Box>

                            {/* 4. Sharing & Team Card */}
                            <Box sx={{ gridColumn: { xs: 'span 1', md: 'span 7' }, bgcolor: '#fff', border: '1px solid #c7c4d8', borderRadius: 3, p: 3, display: 'flex', flexDirection: 'column', transition: 'all 0.2s', '&:hover': { borderColor: '#4f46e5', boxShadow: '0 4px 12px -2px rgba(79, 70, 229, 0.08)' } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'nowrap' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                                        <Share sx={{ color: '#3525cd', flexShrink: 0 }} />
                                        <Typography sx={{ fontSize: { xs: '16px', sm: '20px' }, fontWeight: 600, color: '#111c2d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Sharing & Team</Typography>
                                    </Box>
                                    {isOwner && (
                                        <Button 
                                            onClick={() => setIsShareDialogOpen(true)}
                                            startIcon={<PersonAdd />}
                                            sx={{ color: '#3525cd', fontSize: { xs: '11px', sm: '12px' }, fontWeight: 600, textTransform: 'none', flexShrink: 0, minWidth: 'auto' }}
                                        >
                                            Add Member
                                        </Button>
                                    )}
                                </Box>

                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                    {/* Owner Fake/Real Row - We can just show 'You' or actual owner */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#fff', border: '1px solid #e0e3e5', borderRadius: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Avatar sx={{ width: 40, height: 40, bgcolor: '#4f46e5', fontSize: '16px' }}>
                                                {(canvases.find(c => c.id === initialActiveCanvasId)?.user?.first_name?.[0]) || 'O'}
                                            </Avatar>
                                            <Box>
                                                <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#111c2d' }}>
                                                    {canvases.find(c => c.id === initialActiveCanvasId)?.user_id === currentUserId ? 'You (Owner)' : (canvases.find(c => c.id === initialActiveCanvasId)?.user?.first_name || 'Owner')}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box sx={{ bgcolor: '#e2dfff', color: '#3323cc', px: 1, py: 0.5, borderRadius: 1, fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Owner</Box>
                                    </Box>
                                    
                                    {/* Shared Users */}
                                    {sharedUsers.length === 0 && canvases.find(c => c.id === initialActiveCanvasId)?.user_id === currentUserId && (
                                        <Typography sx={{ fontSize: '13px', color: '#464555', fontStyle: 'italic', mt: 1 }}>Not shared with anyone yet.</Typography>
                                    )}
                                    {sharedUsers.map((u: any) => (
                                        <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#fff', border: '1px solid #e0e3e5', borderRadius: 2 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Avatar sx={{ width: 40, height: 40, border: '2px solid #cfdaf2', bgcolor: '#f0f3ff', color: '#111c2d', fontSize: '16px' }}>{u.first_name[0]}</Avatar>
                                                <Box>
                                                    <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#111c2d' }}>{u.first_name} {u.last_name}</Typography>
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ bgcolor: '#dee8ff', color: '#464555', px: 1, py: 0.5, borderRadius: 1, fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{u.pivot?.permission === 'view' ? 'Viewer' : 'Editor'}</Box>
                                                {isOwner && <IconButton size="small" onClick={() => setUserToDelete(u)} sx={{ color: '#ba1a1a', p: 0.5 }}><DeleteIcon fontSize="small" /></IconButton>}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>

                            {/* 5. Version History */}
                            <Box sx={{ gridColumn: { xs: 'span 1', md: 'span 5' }, bgcolor: '#fff', border: '1px solid #c7c4d8', borderRadius: 3, p: 3, display: 'flex', flexDirection: 'column', transition: 'all 0.2s', '&:hover': { borderColor: '#4f46e5', boxShadow: '0 4px 12px -2px rgba(79, 70, 229, 0.08)' } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                    <HistoryIcon sx={{ color: '#3525cd' }} />
                                    <Typography sx={{ fontSize: '20px', fontWeight: 600, color: '#111c2d' }}>Version History</Typography>
                                </Box>
                                
                                <Box sx={{ pl: 2, borderLeft: '2px solid #c7c4d8', ml: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                    {history.length === 0 ? (
                                        <Typography sx={{ fontSize: '14px', color: '#464555', fontStyle: 'italic' }}>No saves yet.</Typography>
                                    ) : (
                                        history.slice(0, 5).map(item => {
                                            const isActive = activeVersionId === item.id;
                                            return (
                                                <Box key={item.id} sx={{ position: 'relative', cursor: 'pointer', '&:hover .timeline-dot': { bgcolor: '#3525cd' } }} onClick={() => handleLoadVersion(item.id)}>
                                                    <Box className="timeline-dot" sx={{ position: 'absolute', left: -25, top: 4, width: 14, height: 14, bgcolor: isActive ? '#3525cd' : '#c7c4d8', border: '3px solid #fff', borderRadius: '50%', transition: 'background-color 0.2s' }} />
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: isActive ? '#3525cd' : '#111c2d' }}>
                                                            v{item.id} {isActive && '(Active)'}
                                                        </Typography>
                                                        <Typography sx={{ fontSize: '11px', color: '#464555' }}>{formatDate(item.created_at)}</Typography>
                                                    </Box>
                                                    <Typography sx={{ fontSize: '11px', color: '#464555', fontStyle: 'italic', mt: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.comment || 'No comment'}
                                                    </Typography>
                                                </Box>
                                            );
                                        })
                                    )}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Drawer>

                {/* Create Canvas Dialog */}
                <Dialog disableEnforceFocus open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} maxWidth="xs" fullWidth>
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

                {/* Share Canvas Dialog */}
                <Dialog disableEnforceFocus open={isShareDialogOpen} onClose={() => setIsShareDialogOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle fontWeight="bold">Share Canvas</DialogTitle>
                    <DialogContent>
                        <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                            <InputLabel>Select User</InputLabel>
                            <Select
                                value={selectedUserToShare}
                                label="Select User"
                                onChange={e => setSelectedUserToShare(e.target.value as string)}
                            >
                                {allUsers?.filter((u: any) => !sharedUsers.some(su => String(su.id) === String(u.id))).map((u: any) => (
                                    <MenuItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                            <InputLabel>Permission</InputLabel>
                            <Select
                                value={selectedPermission}
                                label="Permission"
                                onChange={e => setSelectedPermission(e.target.value as 'view'|'edit')}
                            >
                                <MenuItem value="edit">Editor (Can make changes)</MenuItem>
                                <MenuItem value="view">Viewer (Read-only)</MenuItem>
                            </Select>
                        </FormControl>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setIsShareDialogOpen(false)} color="inherit">Cancel</Button>
                        <Button onClick={() => { handleShareCanvas(); setIsShareDialogOpen(false); }} color="primary" variant="contained" disableElevation disabled={!selectedUserToShare}>Share</Button>
                    </DialogActions>
                </Dialog>

                {/* Confirm Delete Shared User Dialog */}
                <Dialog disableEnforceFocus open={Boolean(userToDelete)} onClose={() => setUserToDelete(null)} maxWidth="xs" fullWidth>
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
                    anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                    sx={{ mt: { xs: 7, sm: 8 }, ml: { xs: 1, sm: 2 } }}
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