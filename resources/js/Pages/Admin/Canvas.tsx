import React, { useRef, useState } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { Menu, Save, History, Check, X, User, Clock } from 'lucide-react';

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

// ----------------------------------------------------------------------------
// MinIO-backed asset store.
//
// IMPORTANT: In tldraw v2, TLAssetStore.upload() MUST return a plain string
// URL — not an object. Returning { src: url } causes the schema validator to
// throw "Expected string, got an object" when the value is written into
// asset.props.src. The resolve() method handles reading it back from the asset.
// ----------------------------------------------------------------------------
const customAssetStore: any = {
    async upload(_asset: any, file: File): Promise<string> {
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

        return url;
    },
    async resolve(asset: any): Promise<string> {
        // asset.props.src is the URL string we returned from upload()
        return asset.props?.src ?? '';
    }
};

export default function Canvas({ latestSnapshot, latestVersionInfo, history: initialHistory }: CanvasProps) {

    // -------------------------------------------------------------------------
    // Sanitize a raw snapshot from the DB into a valid tldraw payload.
    //
    // Old snapshots (saved before MinIO integration) contain null values on
    // many shape and asset props that tldraw's strict schema now rejects.
    // We patch ALL known nullable string fields across all shape types here
    // so we don't have to chase individual ValidationErrors one by one.
    // -------------------------------------------------------------------------
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

                // --- Patch all shape types with a url prop (geo, image, text, etc.) ---
                if (record.typeName === 'shape' && record.props) {
                    // Every tldraw shape that has a `url` prop requires it to be a string
                    if ('url' in record.props && (record.props.url === null || record.props.url === undefined)) {
                        record.props.url = '';
                    }

                    // CRITICAL: Ensure this only filters canvas SHAPES, not assets!
                    if (record.type === 'image') {
                        const allowedImageProps = new Set(['w', 'h', 'playing', 'url', 'assetId', 'crop', 'flipX', 'flipY', 'altText']);
                        Object.keys(record.props).forEach(key => {
                            if (!allowedImageProps.has(key)) {
                                delete record.props[key];
                            }
                        });

                        if (record.props.altText === undefined || record.props.altText === null) record.props.altText = '';
                        if (record.props.url === null || record.props.url === undefined) record.props.url = '';
                        if (record.props.assetId === undefined) record.props.assetId = null;
                        if (record.props.crop === undefined) record.props.crop = null;
                        if (record.props.playing === undefined) record.props.playing = true;
                        if (record.props.flipX === undefined) record.props.flipX = false;
                        if (record.props.flipY === undefined) record.props.flipY = false;
                    }
                }

                // --- Patch asset records: asset.props.src must be a string ---
                if (record.typeName === 'asset' && record.props) {
                    if (record.props.src === null || record.props.src === undefined) {
                        record.props.src = '';
                    }
                    // src must not be an object (old blob store returned { src: url })
                    if (typeof record.props.src === 'object') {
                        record.props.src = (record.props.src as any)?.src ?? '';
                    }
                }

                // --- Patch user records: imageUrl must be a string ---
                if (record.typeName === 'user') {
                    if (record.imageUrl === null || record.imageUrl === undefined) {
                        record.imageUrl = '';
                    }
                }

                // --- Patch null/missing name props on structural records ---
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
    const tldrawKey = 'canvas-root'; // static — we use imperative loadSnapshot for switching

    const [showFlash, setShowFlash] = useState(false);
    const [history, setHistory] = useState<HistoryItem[]>(initialHistory || []);
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [activeVersionId, setActiveVersionId] = useState<number | null>(latestVersionInfo?.id || null);

    const initialSnapshot = getSanitizedSnapshot(latestSnapshot);

    const handleMount = (editor: Editor) => {
        editorRef.current = editor;
        (window as any).editor = editor;

        // Patch any null imageUrl on user records in the store.
        // (editor.setUserPreferences does NOT exist in tldraw v2 — must use store API)
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
                snapshot_json: snapshot,
                comment,
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
                const sanitized = getSanitizedSnapshot(response.data);
                if (sanitized) {
                    editor.loadSnapshot(sanitized);
                    setTimeout(() => editor.zoomToFit({ animation: { duration: 200 } }), 100);
                }
                setActiveVersionId(id);
                setIsFabOpen(false);
            }
        } catch (error) {
            console.error('Failed to load snapshot version:', error);
            alert('Could not open this canvas version entry.');
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0f172a' }}>
            <Head title="Canvas Admin" />

            {/* ── Flash Notification ── */}
            {showFlash && (
                <div style={{
                    position: 'absolute',
                    top: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#1e293b',
                    border: '1px solid #22c55e44',
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
              ── FAB Hamburger ──
              Screen is divided into 4 equal quarters.
              Button sits at the START of the 4th quarter = 75% from left = 25% from right.
              top: 8px keeps it tight to the top edge, out of the canvas drawing area.
            */}
            <div style={{
                position: 'absolute',
                top: 8,
                right: '25%',
                zIndex: 1000,
            }}>
                <button
                    onClick={() => setIsFabOpen(!isFabOpen)}
                    title={isFabOpen ? 'Close menu' : 'Save / History'}
                    style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '22px',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        border: '1px solid #ffffff25',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                        transition: 'background 0.2s, transform 0.15s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#334155';
                        e.currentTarget.style.transform = 'scale(1.08)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#1e293b';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    {isFabOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {/* ── Dropdown Panel ── */}
                {isFabOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '52px',
                        right: 0,
                        backgroundColor: '#1e293b',
                        border: '1px solid #ffffff1a',
                        borderRadius: '14px',
                        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
                        width: '300px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {/* Save Button */}
                        <div style={{ padding: '14px', borderBottom: '1px solid #ffffff12' }}>
                            <button
                                onClick={handleSave}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    padding: '11px',
                                    backgroundColor: '#c05800',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '9px',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    width: '100%',
                                    fontSize: '13px',
                                    letterSpacing: '0.02em',
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e06a00')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#c05800')}
                            >
                                <Save size={16} /> Save Canvas Snapshot
                            </button>
                        </div>

                        {/* Version History */}
                        <div style={{ maxHeight: '380px', overflowY: 'auto', backgroundColor: '#0f172a' }}>

                            {/* Section header */}
                            <div style={{
                                padding: '10px 14px 6px',
                                fontSize: '10px',
                                fontWeight: '700',
                                color: '#64748b',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}>
                                <History size={12} /> Version History
                            </div>

                            {history.length === 0 ? (
                                <div style={{ padding: '20px 14px', color: '#475569', fontSize: '13px', textAlign: 'center' }}>
                                    No saves yet.
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
                                                padding: '10px 14px',
                                                background: isActive ? '#6366f115' : 'transparent',
                                                border: 'none',
                                                borderBottom: '1px solid #ffffff08',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isActive) e.currentTarget.style.backgroundColor = '#ffffff08';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            {/* Version ID + active badge */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                <span style={{
                                                    fontWeight: '700',
                                                    fontSize: '13px',
                                                    color: isActive ? '#818cf8' : '#e2e8f0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                }}>
                                                    v{item.id}
                                                    {isActive && (
                                                        <span style={{
                                                            fontSize: '9px',
                                                            backgroundColor: '#6366f1',
                                                            color: '#fff',
                                                            padding: '1px 6px',
                                                            borderRadius: '10px',
                                                            fontWeight: '600',
                                                            letterSpacing: '0.04em',
                                                        }}>ACTIVE</span>
                                                    )}
                                                </span>
                                            </div>

                                            {/* Comment */}
                                            <div style={{
                                                fontSize: '12px',
                                                color: '#94a3b8',
                                                marginBottom: '6px',
                                                lineHeight: '1.4',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}>
                                                {item.comment || 'No comment'}
                                            </div>

                                            {/* Saved by + time */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {item.user && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                                                        <User size={10} />
                                                        {item.user.first_name} {item.user.last_name}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                                                    <Clock size={10} />
                                                    {formatDate(item.created_at)}
                                                </div>
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
