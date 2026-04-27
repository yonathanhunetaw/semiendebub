import React from 'react';
import { Head } from '@inertiajs/react';

export default function StockIndex() {
    return (
        <div className="p-6 bg-[#0f172a] text-white">
            <Head title="Admin | Stock Management" />
            <div className="flex justify-between items-center border-b border-[#c2410c] pb-4">
                <h1 className="text-xl font-extrabold uppercase tracking-widest text-[#c2410c]">
                    Inventory Control
                </h1>
                <button className="bg-[#c2410c] px-4 py-2 rounded-md font-bold">Add Stock</button>
            </div>
            {/* Table components using your 'md' 8px rounding */}
            <div className="mt-8 bg-[#1e293b] rounded-lg p-4">
                <p className="text-[#71717a] font-mono uppercase text-xs">System Live</p>
            </div>
        </div>
    );
}
