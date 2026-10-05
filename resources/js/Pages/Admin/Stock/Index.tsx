import React from 'react';
import { Head } from '@inertiajs/react';

export default function StockIndex() {
    return (
        <div className="p-6 bg-background text-on-surface">
            <Head title="Admin | Stock Management" />
            <div className="flex justify-between items-center border-b border-primary pb-4">
                <h1 className="text-xl font-extrabold uppercase tracking-widest text-primary">
                    Inventory Control
                </h1>
                <button className="bg-primary text-on-primary px-4 py-2 rounded-md font-bold">Add Stock</button>
            </div>
            {/* Table components using your 'md' 8px rounding */}
            <div className="mt-8 bg-surface-container rounded-lg p-4">
                <p className="text-outline font-mono uppercase text-xs">System Live</p>
            </div>
        </div>
    );
}
