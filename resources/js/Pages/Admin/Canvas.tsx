import React, { useRef, useState } from 'react';
import { Tldraw, Editor, setUserPreferences } from 'tldraw';
import 'tldraw/tldraw.css';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { Menu, Save, History, Check, X } from 'lucide-react';

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

// MinIO-backed asset store: uploads images to your S3/MinIO bucket for persistent URLs
const customAssetStore: any = {
    async upload(_asset: any, file: File) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await axios.post('/canvas/upload-asset', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        // Returns a permanent public MinIO URL — safe to persist in snapshot_json
        return { src: response.data.url };
    },
    async resolve(asset: any) {
        return asset.props.src;
    }
};

export default function Canvas({ latestSnapshot, latestVersionInfo, history: initialHistory }: CanvasProps) {

    // Sanitize a raw snapshot payload from the DB into a clean object tldraw can consume
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

        if (finalDoc && finalDoc.store) {
            Object.values(finalDoc.store).forEach((record: any) => {
                if (!record || typeof record !== 'object') return;

                // Patch corrupted image shape props: null values must be empty strings
                if (record.typeName === 'shape' && record.type === 'image' && record.props) {
                    const stringProps = ['url', 'altText', 'src', 'crop'];
                    stringProps.forEach(key => {
                        if (record.props[key] === null || record.props[key] === undefined) {
                            // 'crop' can be null legitimately — only patch string fields
                            if (key !== 'crop') record.props[key] = '';
                        }
                    });
                }

                // Patch null imageUrl on user records — prevents save validation crash
                if (record.typeName === 'user') {
                    if (record.imageUrl === null || record.imageUrl === undefined) {
                        record.imageUrl = '';
                    }
                }

                // Patch null/missing names on structural records
                if (record.name === null || record.name === undefined) {
                    if (record.typeName === 'document') record.name = 'Canvas';
                    else if (record.typeName === 'user') record.name = 'Admin';
                    else if (record.typeName === 'page') record.name = 'Page';
                    else if ('name' in record) record.name = '';
                }
            });
        }

        return finalDoc;
    };

    const editorRef = useRef<Editor | null>(null);

    const [showFlash, setShowFlash]             = useState(false);
    const [history, setHistory]                  = useState<HistoryItem[]>(initialHistory || []);
    const [isFabOpen, setIsFabOpen]              = useState(false);
    const [activeVersionId, setActiveVersionId]  = useState<number | null>(latestVersionInfo?.id || null);
    const [tldrawKey, setTldrawKey]              = useState('initial-canvas');

    // We hold the initial snapshot in state only for the very first mount.
    // After that, we use the imperative editor.loadSnapshot() for switching versions,
    // because updating the `snapshot` prop after mount does NOT reload the canvas.
    const initialSnapshot = getSanitizedSnapshot(latestSnapshot);

    const handleMount = (editor: Editor) => {
        editorRef.current = editor;
        (window as any).editor = editor;

        // Fix Issue 1: Patch null imageUrl on user records in the store.
        // editor.setUserPreferences() does NOT exist on Editor in tldraw v2 —
        // the correct API is to update the user records directly in the store.
        try {
            const userRecords = (editor.store as any).query?.records('user')?.get?.() ?? [];
            if (Array.isArray(userRecords) && userRecords.length > 0) {
                const patched = userRecords
                    .filter((u: any) => u.imageUrl === null || u.imageUrl === undefined)
                    .map((u: any) => ({ ...u, imageUrl: '' }));
                if (patched.length > 0) {
                    editor.store.put(patched);
                }
            }
        } catch (e) {
            // Non-fatal — if the query API isn't available just continue
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
            // Now that imageUrl is always a string, getSnapshot() won't throw
            const snapshot = editor.getSnapshot();

            const response = await axios.post('/canvas/save', {
                snapshot_json: snapshot,
                comment: comment,
            });

            if (response.status === 200) {
                setShowFlash(true);
                setTimeout(() => setShowFlash(false), 3000);
                setIsFabOpen(false);

                const newVersionId = response.data.version_id;
                setHistory(prev => [
                    { id: newVersionId, comment, created_at: new Date().toISOString() },
                    ...prev,
                ]);
                setActiveVersionId(newVersionId);
            }
        } catch (error) {
            console.error('Failed to save canvas data:', error);
            alert('Save failed — check the console for details.');
        }
    };

    const handleLoadVersion = async (id: number) => {
        const editor = editorRef.current;
        if (!editor) return;

        try {
            const response = await axios.get(`/canvas/version/${id}`);
            if (response.data) {
                // Fix Issue 2: Use the imperative API — updating the `snapshot` prop
                // after mount silently does nothing in tldraw v2.
                const sanitized = getSanitizedSnapshot(response.data);
                if (sanitized) {
                    editor.loadSnapshot(sanitized);
                    setTimeout(() => {
                        editor.zoomToFit({ animation: { duration: 200 } });
                    }, 100);
                }
                setActiveVersionId(id);
                setIsFabOpen(false);
            }
        } catch (error) {
            console.error('Failed to load snapshot version:', error);
            alert('Could not open this canvas version entry.');
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0f172a' }}>
            <Head title="Canvas Admin" />

            {/* Flash Notification */}
            {showFlash && (
                <div style={{
                    position: 'absolute',
                    top: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#1e293b',
                    border: '1px solid #ffffff1f',
                    color: '#ffffff',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    zIndex: 2000,
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Check size={18} color="#22c55e" /> Canvas Saved Successfully
                </div>
            )}

            {/*
              FAB Control Anchor
              Positioned at top: 12px so it sits at the very top edge.
              right: '28%' puts it in the middle of the right half of the screen,
              safely away from tldraw's native right-side toolbar/color chooser.
            */}
            <div style={{
                position: 'absolute',
                top: 12,
                right: '28%',
                zIndex: 1000,
            }}>
                <button
                    onClick={() => setIsFabOpen(!isFabOpen)}
                    style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '23px',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        border: '1px solid #ffffff2a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2d3748')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                >
                    {isFabOpen ? <X size={22} /> : <Menu size={22} />}
                </button>

                {/* Dropdown Panel — opens downward from the FAB */}
                {isFabOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '56px',
                        right: 0,
                        backgroundColor: '#1e293b',
                        border: '1px solid #ffffff1f',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
                        width: '320px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {/* Save Action */}
                        <div style={{ padding: '16px', borderBottom: '1px solid #ffffff1f' }}>
                            <button
                                onClick={handleSave}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '12px',
                                    backgroundColor: '#c05800',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    width: '100%',
                                    fontSize: '14px',
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e06a00')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#c05800')}
                            >
                                <Save size={18} /> Save Canvas Snapshot
                            </button>
                        </div>

                        {/* History List */}
                        <div style={{
                            maxHeight: '350px',
                            overflowY: 'auto',
                            backgroundColor: '#0f172a'
                        }}>
                            <div style={{
                                padding: '12px 16px 8px 16px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                color: '#a1a1aa',
                                letterSpacing: '0.05em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <History size={14} /> VERSION HISTORY
                            </div>

                            {history.length === 0 ? (
                                <div style={{ padding: '16px', color: '#71717a', fontSize: '13px', textAlign: 'center' }}>
                                    No saves found.
                                </div>
                            ) : (
                                history.map((item) => {
                                    const isActive = activeVersionId === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleLoadVersion(item.id)}
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '12px 16px',
                                                background: isActive ? '#6366f11a' : 'transparent',
                                                border: 'none',
                                                borderBottom: '1px solid #ffffff0a',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isActive) e.currentTarget.style.backgroundColor = '#ffffff0a';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <div style={{
                                                    fontWeight: '600',
                                                    fontSize: '14px',
                                                    color: isActive ? '#6366f1' : '#ffffff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    Version #{item.id}
                                                    {isActive && <Check size={14} />}
                                                </div>
                                                {item.user && (
                                                    <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
                                                        {item.user.first_name} {item.user.last_name}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '6px', lineHeight: '1.4' }}>
                                                {item.comment}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#71717a' }}>
                                                {new Date(item.created_at).toLocaleString()}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            <Tldraw
                key={tldrawKey}
                snapshot={initialSnapshot}
                assets={customAssetStore}
                onMount={handleMount}
                components={{ DebugMenu: null }}
            />
        </div>
    );
}
