import React, { useState } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Head } from '@inertiajs/react';
import axios from 'axios';

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
    const [isOpenHistory, setIsOpenHistory] = useState(false);
    const [activeVersionId, setActiveVersionId] = useState<number | null>(latestVersionInfo?.id || null);

    // Centralized safe loading utility that handles both legacy records and modern snapshots
    // Centralized safe loading utility that handles both legacy records and modern snapshots
    // Centralized safe loading utility that handles both legacy records and modern snapshots
    const cleanAndLoadSnapshot = (editor: Editor, rawData: any) => {
        if (!rawData) return;
        try {
            let clean = JSON.parse(JSON.stringify(rawData));
            
            // 1. Unpack database layer if present
            if (clean && clean.snapshot_json) {
                clean = clean.snapshot_json;
            }

            // 2. Structural Fix: Ensure top-level document structure exists
            // tldraw expects a TLEditorSnapshot containing a "document" property.
            if (!clean.document) {
                // If we have a raw store direct map, wrap it appropriately
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

            // 3. Document validation patch
            if (clean.document && clean.document.store) {
                const store = clean.document.store;
                
                // Ensure essential canvas page context items exist to prevent currentPageId crashes
                const hasPage = Object.values(store).some((r: any) => r && r.typeName === 'page');
                if (!hasPage) {
                    editor.loadSnapshot(editor.getSnapshot()); 
                    return;
                }

                // Patch missing or invalid data on store records to prevent tldraw validation crashes
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
                        if (record.typeName === 'document') {
                            record.name = 'Canvas';
                        } else if (record.typeName === 'user') {
                            record.name = 'User';
                        } else if (record.typeName === 'page') {
                            record.name = 'Page';
                        } else if ('name' in record) {
                            record.name = '';
                        }
                    }
                });

                // Partition historical records into document and session stores
                // Tldraw v5 strictly expects local/meta records to be in 'session', and shared records in 'document'.
                const documentRecords: Record<string, any> = {};
                const sessionRecords: Record<string, any> = {};
                
                const DOCUMENT_TYPES = new Set(['document', 'page', 'shape', 'asset', 'binding']);

                Object.keys(store).forEach(key => {
                    const record = store[key];
                    if (DOCUMENT_TYPES.has(record.typeName)) {
                        documentRecords[key] = record;
                    } else {
                        sessionRecords[key] = record;
                    }
                });

                // 4. Merge into a pristine snapshot to ensure meta-records exist
                const pristineSnapshot = editor.getSnapshot();
                
                // Keep the pristine document records, overlay our historical shared records
                clean.document.store = { ...pristineSnapshot.document.store, ...documentRecords };
                
                // If historical schema is missing or invalid, fallback to pristine schema
                if (!clean.document.schema || !clean.document.schema.sequences) {
                    clean.document.schema = pristineSnapshot.document.schema;
                }


                // We DO NOT patch or pass a session object at all. 
                // Passing a raw session object or adding a "store" property to it causes
                // strict validation errors like "At store: Unexpected property".
                // Instead, we will pass ONLY the clean document snapshot.
            }

            // 6. Pass ONLY the validated, merged document snapshot directly into the engine.
            // Tldraw will automatically generate a perfectly valid session for this document.
            editor.loadSnapshot(clean.document);

            setTimeout(() => {
                editor.zoomToFit({ animation: { duration: 200 } });
            }, 100);

        } catch (e) {
            console.error('Failed to parse or sanitize canvas data:', e);
        }
    };

    const handleMount = (editor: Editor) => {
        (window as any).editor = editor;

        // Safely load the initial state right after mounting completes
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

                const newVersionId = response.data.version_id;
                setHistory(prev => [
                    {
                        id: newVersionId,
                        comment: comment,
                        created_at: new Date().toISOString()
                        // Currently omits eager-loaded user info for immediately saved optimistic updates,
                        // but it will refresh on page load. Or we can just let it display without name temporarily.
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
            }
        } catch (error) {
            console.error('Failed to load snapshot version:', error);
            alert('Could not open this canvas version entry.');
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Head title="Canvas Admin" />

            {/* Success Notification */}
            {showFlash && (
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 2000,
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span>✓</span> Saved
                </div>
            )}

            {/* Control Layout Panels */}
            <div style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                alignItems: 'flex-end'
            }}>
                {/* Save Button */}
                <button
                    onClick={handleSave}
                    style={{
                        padding: '12px 24px',
                        backgroundColor: '#2f60e6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px',
                        width: '100%'
                    }}
                >
                    Save
                </button>

                {/* Versions dropdown opening upwards */}
                <div style={{ position: 'relative', width: '100%' }}>
                    <button
                        onClick={() => setIsOpenHistory(!isOpenHistory)}
                        style={{
                            padding: '10px 16px',
                            backgroundColor: '#1f2937',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            fontSize: '13px',
                            width: '100%',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {activeVersionId 
                            ? `📂 Version #${activeVersionId} ${history.find(h => h.id === activeVersionId)?.user ? `by ${history.find(h => h.id === activeVersionId)?.user?.first_name}` : ''}`
                            : `📂 Load Saved Versions (${history.length})`
                        }
                    </button>

                    {isOpenHistory && (
                        <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            right: 0,
                            marginBottom: '8px',
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            width: '280px',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            padding: '8px'
                        }}>
                            <div style={{ padding: '4px 8px 8px 8px', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
                                SELECT A VERSION TO OPEN
                            </div>
                            {history.length === 0 ? (
                                <div style={{ padding: '12px 8px', color: '#9ca3af', fontSize: '13px' }}>No saves found.</div>
                            ) : (
                                history.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            handleLoadVersion(item.id);
                                            setIsOpenHistory(false);
                                        }}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '8px 8px',
                                            background: 'none',
                                            border: 'none',
                                            borderBottom: '1px solid #f3f4f6',
                                            cursor: 'pointer',
                                            borderRadius: '4px',
                                            transition: 'background 0.2s',
                                            backgroundColor: activeVersionId === item.id ? '#f0fdf4' : 'transparent'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = activeVersionId === item.id ? '#f0fdf4' : '#f3f4f6')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = activeVersionId === item.id ? '#f0fdf4' : 'transparent')}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontWeight: '600', fontSize: '13px', color: activeVersionId === item.id ? '#166534' : '#111827' }}>
                                                Version #{item.id} {activeVersionId === item.id && <span style={{ color: '#22c55e', marginLeft: '4px' }}>✓</span>}
                                            </div>
                                            {item.user && (
                                                <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 'normal' }}>
                                                    {item.user.first_name} {item.user.last_name}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#4b5563', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            {item.comment}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                                            {new Date(item.created_at).toLocaleString()}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Tldraw Workspace Component - Safe initialization */}
            <Tldraw onMount={handleMount} />
        </div>
    );
}
