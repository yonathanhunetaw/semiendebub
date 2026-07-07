import React from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Head } from '@inertiajs/react';

export default function Canvas() {
    const handleMount = (editor: Editor) => {
        // Store the editor instance globally for your save/load functions
        (window as any).editor = editor;
    };

    const handleSave = async () => {
        const editor = (window as any).editor;
        if (!editor) return;

        const snapshot = editor.store.serialize();
        
        // This will be your Laravel API route
        const response = await fetch('/admin/canvas/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content
            },
            body: JSON.stringify({ snapshot_json: snapshot })
        });

        if (response.ok) {
            alert('Version saved and pending approval!');
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Head title="Canvas Admin" />
            
            {/* Simple Save Button Overlay */}
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000 }}>
                <button onClick={handleSave} style={{ padding: '10px 20px' }}>
                    Save for Approval
                </button>
            </div>

            <Tldraw onMount={handleMount} />
        </div>
    );
}