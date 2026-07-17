import React, { useState } from 'react';
import { Tldraw, Editor } from 'tldraw';
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

export default function Canvas({ latestSnapshot, latestVersionInfo, history: initialHistory }: CanvasProps) {
    const [showFlash, setShowFlash] = useState(false);
    const [history, setHistory] = useState<HistoryItem[]>(initialHistory || []);
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [activeVersionId, setActiveVersionId] = useState<number | null>(latestVersionInfo?.id || null);

    const cleanAndLoadSnapshot = (editor: Editor, rawData: any) => {
        if (!rawData) return;
        try {
            let clean = JSON.parse(JSON.stringify(rawData));

            // Pitfall A: Handle double-encoded JSON if it arrives as a string
            if (typeof clean === 'string') {
                try { clean = JSON.parse(clean); } catch (e) { }
            }

            if (clean && clean.snapshot_json) {
                clean = clean.snapshot_json;
            }

            if (typeof clean === 'string') {
                try { clean = JSON.parse(clean); } catch (e) { }
            }

            // Pitfall C: Empty or Null Snapshots on Creation
            if (!clean || Object.keys(clean).length === 0 || (Array.isArray(clean) && clean.length === 0)) {
                return; // Let tldraw initialize a fresh, empty canvas natively
            }

            if (!clean.document) {
                const records = clean.store ? clean.store : clean;
                let schema = clean.schema;

                if (!schema || !schema.sequences) {
                    schema = editor.store.schema.serialize();
                }

                clean = {
                    document: {
                        store: records,
                        schema: schema
                    }
                };
            }

            if (clean.document && clean.document.store) {
                const store = clean.document.store;

                const hasPage = Object.values(store).some((r: any) => r && r.typeName === 'page');
                if (!hasPage) {
                    editor.loadSnapshot(editor.getSnapshot());
                    return;
                }

                Object.keys(store).forEach(key => {
                    const record = store[key];
                    if (!record || typeof record !== 'object') {
                        delete store[key];
                        return;
                    }

                    if (record.typeName === undefined) {
                        delete store[key];
                        return;
                    }

                    if (record.name === null || record.name === undefined) {
                        if (record.typeName === 'document') record.name = 'Canvas';
                        else if (record.typeName === 'user') record.name = 'User';
                        else if (record.typeName === 'page') record.name = 'Page';
                        else if ('name' in record) record.name = '';
                    }
                });

                const documentRecords: Record<string, any> = {};
                const DOCUMENT_TYPES = new Set(['document', 'page', 'shape', 'asset', 'binding']);

                Object.keys(store).forEach(key => {
                    const record = store[key];
                    if (DOCUMENT_TYPES.has(record.typeName)) {
                        documentRecords[key] = record;
                    }
                });

                const pristineSnapshot = editor.getSnapshot();

                // FIX: Instead of merging pristine document store (which retains current shapes),
                // we ONLY keep the base document record and inject our historical records.
                // This ensures the canvas slate is wiped clean of any active drawings.
                clean.document.store = {
                    // Keep everything that tldraw naturally expects on mount (ui state, instance details, camera positions)
                    ...pristineSnapshot.document.store,
                    // Safely inject your historical blueprint elements over it
                    ...documentRecords
                };

                if (!clean.document.schema || !clean.document.schema.sequences) {
                    clean.document.schema = pristineSnapshot.document.schema;
                }
            }

            editor.loadSnapshot(clean.document);

            setTimeout(() => {
                editor.zoomToFit({ animation: { duration: 200 } });
            }, 100);

        } catch (e) {
            console.error('Failed to parse or sanitize canvas data:', e);
        }
    };

    const customAssetOptions: any = {
        onAssetCreate: async (asset: any) => {
            return asset;
        },
        upload: async (_asset: any, file: File) => {
            const src = URL.createObjectURL(file);
            return {
                id: `asset:${Math.random().toString(36).substring(2, 11)}`,
                type: 'image',
                typeName: 'asset',
                props: {
                    name: file.name,
                    src: src,
                    w: 300,
                    h: 300,
                    mimeType: file.type,
                    isAnimated: false,
                },
                meta: {},
            };
        }
    };

    const handleMount = (editor: Editor) => {
        (window as any).editor = editor;
        
        // Force an instant update to establish stable page boundaries
        (editor as any).updatePageState?.({ id: editor.getCurrentPageId() });
        
        if (latestSnapshot) {
            cleanAndLoadSnapshot(editor, latestSnapshot);
        }
    };

    const handleSave = async () => {
        const editor = (window as any).editor;
        if (!editor) return;

        const snapshot = editor.getSnapshot();
        const comment = prompt("Enter a comment for this save:", "Updated canvas blueprint") || "Submitted for review";

        try {
            const response = await axios.post('/canvas/save', {
                snapshot_json: snapshot,
                comment: comment
            });

            if (response.status === 200) {
                setShowFlash(true);
                setTimeout(() => setShowFlash(false), 3000);
                setIsFabOpen(false);

                const newVersionId = response.data.version_id;
                setHistory(prev => [
                    {
                        id: newVersionId,
                        comment: comment,
                        created_at: new Date().toISOString()
                    },
                    ...prev
                ]);
                setActiveVersionId(newVersionId);
            }
        } catch (error) {
            console.error('Failed to save canvas data:', error);
        }
    };

    const handleLoadVersion = async (id: number) => {
        const editor = (window as any).editor;
        if (!editor) return;

        try {
            const response = await axios.get(`/canvas/version/${id}`);
            if (response.data) {
                cleanAndLoadSnapshot(editor, response.data);
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

            {/* FAB Control Anchor - Placed Top Right safe zone */}
            <div style={{
                position: 'absolute',
                top: 64, // below standard top navs
                right: 24,
                zIndex: 1000,
            }}>
                <button
                    onClick={() => setIsFabOpen(!isFabOpen)}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '24px',
                        backgroundColor: '#1e293b',
                        color: '#ffffff',
                        border: '1px solid #ffffff1f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2d3748')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                >
                    {isFabOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {/* Dropdown Panel */}
                {isFabOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '60px',
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
                        {/* Header Actions */}
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
                key={activeVersionId ? `version-${activeVersionId}` : 'initial-canvas'}
                assets={customAssetOptions}
                onMount={handleMount} 
            />
        </div>
    );
}
