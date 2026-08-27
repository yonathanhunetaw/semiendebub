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

        window.dispatchEvent(new CustomEvent('canvas-upload-start'));

        try {
            const response = await axios.post('/canvas/upload-asset', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    window.dispatchEvent(new CustomEvent('canvas-upload-progress', { detail: { progress: percentCompleted } }));
                }
            });

            const url = response.data?.url;
            if (typeof url !== 'string' || url.length === 0) {
                console.error('Canvas image upload returned an invalid response:', response.data);
                throw new Error(response.data?.error || 'Canvas image upload did not return a URL.');
            }

            window.dispatchEvent(new CustomEvent('canvas-upload-success'));
            return { src: url };
        } catch (error) {
            window.dispatchEvent(new CustomEvent('canvas-upload-error'));
            throw error;
        }
    },
    async resolve(asset: any): Promise<string> {
        return asset.props?.src ?? '';
    }
};

export default function Canvas({ canvases, activeCanvasId: initialActiveCanvasId, currentUserId, allUsers, sharedUsers: initialSharedUsers, latestSnapshot, latestVersionInfo, history: initialHistory }: CanvasProps) {

    // Helper: Format date strings for history list
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    // -------------------------------------------------------------------------
    // Helper: Sanitize a TipTap rich-text document
    // -------------------------------------------------------------------------
    const sanitizeRichText = (value: any): any => {
        if (!value || typeof value !== 'object') {
            return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
        }

        if (Array.isArray(value)) {
            return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
        }

        let doc = value;
        if (doc.type !== 'doc' || !Array.isArray(doc.content)) {
            if (Array.isArray(doc.content)) {
                doc = { type: 'doc', content: doc.content };
            } else {
                return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
            }
        }

        const sanitizeNode = (node: any): any => {
            if (!node || typeof node !== 'object') {
                return null;
            }

            if (node.type === 'text') {
                if (typeof node.text !== 'string') {
                    if (node.text === null || node.text === undefined) {
                        return null;
                    }
                    try {
                        node.text = String(node.text);
                    } catch {
                        return null;
                    }
                }
                if (node.text.length === 0) {
                    return null;
                }
                if (node.marks !== undefined) {
                    if (!Array.isArray(node.marks)) {
                        delete node.marks;
                    } else {
                        node.marks = node.marks.filter(
                            (mark: any) =>
                                mark && typeof mark === 'object' && typeof mark.type === 'string'
                        );
                    }
                }
                return node;
            }

            if (typeof node.type !== 'string') {
                return null;
            }

            if (Array.isArray(node.content)) {
                node.content = node.content
                    .map((child: any) => sanitizeNode(child))
                    .filter((child: any) => child !== null);
            }

            return node;
        };

        doc.content = doc.content
            .map((child: any) => sanitizeNode(child))
            .filter((child: any) => child !== null);

        if (doc.content.length === 0) {
            doc.content = [{ type: 'paragraph', content: [] }];
        }

        return doc;
    };

    // -------------------------------------------------------------------------
    // Snapshot sanitizer
    // -------------------------------------------------------------------------
    const getSanitizedSnapshot = (rawData: any): any => {
        if (!rawData) return undefined;

        let clean = rawData;

        if (typeof clean === 'string') {
            try {
                clean = JSON.parse(clean);
            } catch (e) {
                return undefined;
            }
        }

        if (clean && clean.snapshot_json) {
            clean = clean.snapshot_json;
        }

        if (typeof clean === 'string') {
            try {
                clean = JSON.parse(clean);
            } catch (e) {
                return undefined;
            }
        }

        const finalDoc = clean?.document || clean;

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
                    if (
                        record.type === 'text' ||
                        record.type === 'note' ||
                        record.type === 'geo' ||
                        record.type === 'arrow'
                    ) {
                        record.props.richText = sanitizeRichText(record.props.richText);
                    }

                    if (
                        'url' in record.props &&
                        (record.props.url === null || record.props.url === undefined)
                    ) {
                        record.props.url = '';
                    }

                    if (record.type === 'frame') {
                        if (typeof record.props.name !== 'string') {
                            record.props.name = '';
                        }
                        if (typeof record.props.w !== 'number' || !Number.isFinite(record.props.w)) {
                            record.props.w = 100;
                        }
                        if (typeof record.props.h !== 'number' || !Number.isFinite(record.props.h)) {
                            record.props.h = 100;
                        }
                    }

                    if (record.type === 'embed') {
                        if (record.props.url === null || record.props.url === undefined) {
                            record.props.url = '';
                        }
                    }

                    if (record.type === 'image') {
                        if (record.props.altText === undefined || record.props.altText === null) {
                            record.props.altText = '';
                        }
                        if (record.props.url === null || record.props.url === undefined) {
                            record.props.url = '';
                        }
                        if (record.props.assetId === undefined) {
                            record.props.assetId = null;
                        }
                        if (record.props.crop === undefined) {
                            record.props.crop = null;
                        }
                        if (record.props.playing === undefined) {
                            record.props.playing = true;
                        }
                        if (record.props.flipX === undefined) {
                            record.props.flipX = false;
                        }
                        if (record.props.flipY === undefined) {
                            record.props.flipY = false;
                        }
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
                        record.props.src = record.props.src?.src ?? '';
                    }
                }

                if (record.typeName === 'user') {
                    if (record.imageUrl === null || record.imageUrl === undefined) {
                        record.imageUrl = '';
                    }
                }

                if (record.name === null || record.name === undefined) {
                    if (record.typeName === 'document') {
                        record.name = 'Canvas';
                    } else if (record.typeName === 'user') {
                        record.name = 'Admin';
                    } else if (record.typeName === 'page') {
                        record.name = 'Page';
                    } else if ('name' in record) {
                        record.name = '';
                    }
                }
            });
        }

        return mutableDoc;
    };

    // Component state & hooks
    const editorRef = useRef<Editor | null>(null);
    const tldrawKey = 'canvas-root';

    const [history, setHistory] = useState<HistoryItem[]>(initialHistory || []);
    const [activeVersionId, setActiveVersionId] = useState<number | null>(latestVersionInfo?.id || null);

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<any>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    const [newCanvasTitle, setNewCanvasTitle] = useState('');
    const [selectedUserToShare, setSelectedUserToShare] = useState('');
    const [selectedPermission, setSelectedPermission] = useState<'view' | 'edit'>('edit');
    const [sharedUsers, setSharedUsers] = useState<any[]>(initialSharedUsers || []);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

    const [unsavedChangesCount, setUnsavedChangesCount] = useState(0);
    const [canvasSizeWarning, setCanvasSizeWarning] = useState<string | null>(null);
    const lastSaveTime = useRef<number>(Date.now());
    const [snapshotReminder, setSnapshotReminder] = useState(false);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saveComment, setSaveComment] = useState('Updated canvas blueprint');
    const [saveAnimKey, setSaveAnimKey] = useState(0);

    useEffect(() => {
        const handleStart = () => setUploadProgress(0);
        const handleProgress = (e: any) => setUploadProgress(e.detail.progress);
        const handleEnd = () => {
            setUploadProgress(100);
            setTimeout(() => setUploadProgress(null), 1000);
        };
        const handleError = () => setUploadProgress(null);

        window.addEventListener('canvas-upload-start', handleStart);
        window.addEventListener('canvas-upload-progress', handleProgress);
        window.addEventListener('canvas-upload-success', handleEnd);
        window.addEventListener('canvas-upload-error', handleError);

        return () => {
            window.removeEventListener('canvas-upload-start', handleStart);
            window.removeEventListener('canvas-upload-progress', handleProgress);
            window.removeEventListener('canvas-upload-success', handleEnd);
            window.removeEventListener('canvas-upload-error', handleError);
        };
    }, []);

    useEffect(() => {
        if (!hasUnsavedChanges) {
            setSnapshotReminder(false);
            return;
        }

        const interval = setInterval(() => {
            if (hasUnsavedChanges && Date.now() - lastSaveTime.current >= 3 * 60 * 1000) {
                setSnapshotReminder(prev => {
                    if (!prev) setSaveAnimKey(k => k + 1);
                    return true;
                });
            }
        }, 30000);

        if (unsavedChangesCount >= 20) {
            setSnapshotReminder(prev => {
                if (!prev) setSaveAnimKey(k => k + 1);
                return true;
            });
            setUnsavedChangesCount(0);
        }

        return () => clearInterval(interval);
    }, [hasUnsavedChanges, unsavedChangesCount]);

    const isFirstMount = useRef(true);
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
        } else {
            setSnackbar({ open: true, message: 'Canvas switched successfully', severity: 'success' });
        }
    }, [initialActiveCanvasId]);

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

    const sizeCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                setUnsavedChangesCount(prev => prev + 1);

                if (sizeCheckTimeout.current) clearTimeout(sizeCheckTimeout.current);
                sizeCheckTimeout.current = setTimeout(() => {
                    const snapshot = editor.getSnapshot();
                    const size = new Blob([JSON.stringify(snapshot)]).size;
                    const mb = size / (1024 * 1024);

                    if (mb >= 2.5) {
                        setCanvasSizeWarning(`Warning: Canvas is getting very large (${mb.toFixed(1)}MB). Please take a snapshot soon to prevent data loss.`);
                    } else if (mb >= 1.5) {
                        setCanvasSizeWarning(`Notice: Canvas size is ${mb.toFixed(1)}MB. Consider taking a snapshot.`);
                    } else {
                        setCanvasSizeWarning(null);
                    }
                }, 2000);
            }
        });

        setTimeout(() => {
            editor.zoomToFit({ animation: { duration: 200 } });
        }, 150);
    };

    const handleSave = () => {
        setSaveComment('Updated canvas blueprint');
        setSaveDialogOpen(true);
    };

    const performSave = async (comment: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        setSaveDialogOpen(false);
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
                setUnsavedChangesCount(0);
                lastSaveTime.current = Date.now();
                setSnapshotReminder(false);

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

                {uploadProgress !== null && (
                    <Box sx={{
                        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, height: '4px',
                        bgcolor: 'rgba(53, 37, 205, 0.2)', transition: 'opacity 0.5s ease',
                        opacity: uploadProgress === 100 ? 0 : 1
                    }}>
                        <Box sx={{
                            height: '100%',
                            width: `${uploadProgress}%`,
                            background: 'linear-gradient(90deg, #4f46e5 0%, #3525cd 100%)',
                            transition: 'width 0.2s ease-out'
                        }} />
                    </Box>
                )}

                <Tldraw
                    key={tldrawKey}
                    snapshot={stableInitialSnapshot}
                    assets={customAssetStore}
                    onMount={handleMount}
                    components={{
                        DebugMenu: null,
                        SharePanel: () => (
                            <Box sx={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 1.5, mr: 1, my: 1.5 }}>
                                {activeCanvas && (
                                    <Box sx={{ bgcolor: 'background.paper', px: 2, py: 0.75, borderRadius: 2, boxShadow: 1, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant="body2" fontWeight="bold" color="text.primary" sx={{ lineHeight: 1.2 }}>
                                            {activeCanvas.title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '10px' }}>
                                            Owned by {activeCanvas.user_id === currentUserId ? 'you' : (activeCanvas.user?.first_name || 'Admin')}
                                        </Typography>
                                    </Box>
                                )}
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<SaveIcon />}
                                    onClick={handleSave}
                                    sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' }, textTransform: 'none', borderRadius: 2 }}
                                >
                                    Snapshot
                                </Button>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<MenuIcon />}
                                    onClick={() => setIsDrawerOpen(true)}
                                    sx={{ bgcolor: 'background.paper', textTransform: 'none', borderRadius: 2 }}
                                >
                                    Menu
                                </Button>
                            </Box>
                        )
                    }}
                />

                {/* Main Management Drawer */}
                <Drawer
                    anchor="right"
                    open={isDrawerOpen}
                    onClose={() => setIsDrawerOpen(false)}
                    PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, p: 3, display: 'flex', flexDirection: 'column' } }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6" fontWeight="bold" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Layers color="primary" /> Canvas Workspace
                        </Typography>
                        <IconButton onClick={() => setIsDrawerOpen(false)} size="small">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    <Divider sx={{ mb: 3 }} />

                    {canvasSizeWarning && (
                        <Alert severity="warning" sx={{ mb: 3, fontSize: '13px' }}>
                            {canvasSizeWarning}
                        </Alert>
                    )}

                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
                            Switch Canvas Blueprint
                        </Typography>
                        <FormControl fullWidth size="small">
                            <Select
                                value={initialActiveCanvasId}
                                onChange={(e) => router.get('/canvas', { canvas_id: e.target.value })}
                                sx={{ borderRadius: 2 }}
                            >
                                {canvases.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                        {c.title} {c.user_id !== currentUserId ? '(Shared)' : ''}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    {isOwner && (
                        <Button
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={() => setIsCreateDialogOpen(true)}
                            fullWidth
                            sx={{ mb: 3, textTransform: 'none', borderRadius: 2, py: 1 }}
                        >
                            Create New Canvas
                        </Button>
                    )}

                    {isOwner && (
                        <Box sx={{ mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Collaboration & Access
                                </Typography>
                                <Button
                                    size="small"
                                    startIcon={<Share fontSize="small" />}
                                    onClick={() => setIsShareDialogOpen(true)}
                                    sx={{ textTransform: 'none', fontSize: '12px' }}
                                >
                                    Share
                                </Button>
                            </Box>
                            <List dense sx={{ bgcolor: 'background.default', borderRadius: 2, maxHeight: 150, overflowY: 'auto', p: 1 }}>
                                {sharedUsers.length === 0 ? (
                                    <Typography variant="caption" color="text.secondary" align="center" display="block" sx={{ py: 1.5 }}>
                                        Not shared with anyone yet.
                                    </Typography>
                                ) : (
                                    sharedUsers.map((u) => (
                                        <ListItem
                                            key={u.id}
                                            secondaryAction={
                                                <IconButton edge="end" size="small" onClick={() => setUserToDelete(u)}>
                                                    <DeleteIcon fontSize="small" color="error" />
                                                </IconButton>
                                            }
                                        >
                                            <ListItemAvatar sx={{ minWidth: 36 }}>
                                                <Avatar sx={{ width: 26, height: 26, fontSize: '12px', bgcolor: 'primary.main' }}>
                                                    {u.first_name?.[0] || 'U'}
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={`${u.first_name} ${u.last_name || ''}`}
                                                secondary={`Permission: ${u.pivot?.permission || 'view'}`}
                                                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                                                secondaryTypographyProps={{ variant: 'caption' }}
                                            />
                                        </ListItem>
                                    ))
                                )}
                            </List>
                        </Box>
                    )}

                    <Divider sx={{ mb: 3 }} />

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <HistoryIcon fontSize="small" /> Version History
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {history.length} saved
                        </Typography>
                    </Box>

                    <List sx={{ flexGrow: 1, overflowY: 'auto', maxHeight: 240, bgcolor: 'background.default', borderRadius: 2, p: 1 }}>
                        {history.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                                No snapshots recorded yet.
                            </Typography>
                        ) : (
                            history.map((item) => {
                                const isActive = activeVersionId === item.id;
                                return (
                                    <ListItem
                                        key={item.id}
                                        onClick={() => handleLoadVersion(item.id)}
                                        sx={{
                                            borderRadius: 1.5,
                                            mb: 1,
                                            cursor: 'pointer',
                                            bgcolor: isActive ? 'primary.main' : 'background.paper',
                                            color: isActive ? 'primary.contrastText' : 'text.primary',
                                            boxShadow: 0,
                                            border: '1px solid',
                                            borderColor: isActive ? 'primary.main' : 'divider',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                bgcolor: isActive ? 'primary.dark' : 'action.hover',
                                            }
                                        }}
                                    >
                                        <ListItemText
                                            primary={
                                                <Typography variant="body2" fontWeight="600" noWrap>
                                                    {item.comment || 'Blueprint Update'}
                                                </Typography>
                                            }
                                            secondary={
                                                <Typography variant="caption" sx={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'text.secondary' }}>
                                                    {formatDate(item.created_at)} {item.user ? `• ${item.user.first_name}` : ''}
                                                </Typography>
                                            }
                                        />
                                    </ListItem>
                                );
                            })
                        )}
                    </List>
                </Drawer>

                {/* Dialogs */}
                <Dialog open={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Create New Canvas</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Canvas Title"
                            fullWidth
                            variant="outlined"
                            value={newCanvasTitle}
                            onChange={(e) => setNewCanvasTitle(e.target.value)}
                            sx={{ mt: 1 }}
                        />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setIsCreateDialogOpen(false)} color="inherit">Cancel</Button>
                        <Button onClick={handleCreateCanvas} variant="contained" disabled={!newCanvasTitle.trim()}>Create</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={isShareDialogOpen} onClose={() => setIsShareDialogOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Share Canvas Access</DialogTitle>
                    <DialogContent>
                        <FormControl fullWidth size="small" sx={{ mt: 1, mb: 2 }}>
                            <InputLabel>Select User</InputLabel>
                            <Select
                                value={selectedUserToShare}
                                label="Select User"
                                onChange={(e) => setSelectedUserToShare(e.target.value)}
                            >
                                {allUsers
                                    .filter((u: any) => u.id !== currentUserId && !sharedUsers.some(su => su.id === u.id))
                                    .map((u: any) => (
                                        <MenuItem key={u.id} value={u.id}>
                                            {u.first_name} {u.last_name || ''} ({u.email})
                                        </MenuItem>
                                    ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Permission Level</InputLabel>
                            <Select
                                value={selectedPermission}
                                label="Permission Level"
                                onChange={(e: any) => setSelectedPermission(e.target.value)}
                            >
                                <MenuItem value="view">Viewer (Read-only)</MenuItem>
                                <MenuItem value="edit">Editor (Can draw & modify)</MenuItem>
                            </Select>
                        </FormControl>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setIsShareDialogOpen(false)} color="inherit">Cancel</Button>
                        <Button onClick={handleShareCanvas} variant="contained" disabled={!selectedUserToShare}>Share</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={Boolean(userToDelete)} onClose={() => setUserToDelete(null)} maxWidth="xs" fullWidth>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Remove User Access</DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Are you sure you want to revoke canvas access for <strong>{userToDelete?.first_name} {userToDelete?.last_name || ''}</strong>?
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setUserToDelete(null)} color="inherit">Cancel</Button>
                        <Button onClick={handleConfirmUnshare} variant="contained" color="error">Revoke Access</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Save Canvas Snapshot</DialogTitle>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Version Description / Comment"
                            fullWidth
                            variant="outlined"
                            value={saveComment}
                            onChange={(e) => setSaveComment(e.target.value)}
                            sx={{ mt: 1 }}
                        />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setSaveDialogOpen(false)} color="inherit">Cancel</Button>
                        <Button onClick={() => performSave(saveComment)} variant="contained">Save Snapshot</Button>
                    </DialogActions>
                </Dialog>

                <Snackbar
                    open={snackbar.open}
                    autoHideDuration={4000}
                    onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert severity={snackbar.severity} sx={{ width: '100%', boxShadow: 3 }}>
                        {snackbar.message}
                    </Alert>
                </Snackbar>
            </Box>
        </ThemeProvider>
    );
}