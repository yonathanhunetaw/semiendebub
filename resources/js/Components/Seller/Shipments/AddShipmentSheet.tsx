import React, { useState } from "react";
import type { LocationOption, NewShipmentInput, NewShipmentTimeWindow } from "@/types/shipments";

/* ----------------------------------------------------------
 | DEMO facility / unit options
 |----------------------------------------------------------*/
export const FACILITIES: LocationOption[] = [
    { value: "central-hub", label: "Central Hub — Kality Logistics Center" },
    { value: "piazza-hub",  label: "Piazza Hub — Piazza Terminal 01" },
    { value: "bole-hub",    label: "Bole Hub — Bole Logistics Center" },
];

export const UNITS: LocationOption[] = [
    { value: "main-store",   label: "Main Store — Merkato Terminal 01" },
    { value: "branch-store", label: "Branch Store — Piazza Terminal 02" },
    { value: "bole-store",   label: "Bole Store — Bole Terminal 03" },
];

export interface AddShipmentSheetProps {
    open: boolean;
    onClose: () => void;
    onAdd: (shipment: NewShipmentInput) => void;
}

/* ----------------------------------------------------------
 | Add Shipment Bottom Sheet (z-[60] to stay above bottom nav)
 |----------------------------------------------------------*/
export default function AddShipmentSheet({ open, onClose, onAdd }: AddShipmentSheetProps) {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const tomorrow = new Date(Date.now() + 86400000 - tzOffset).toISOString().split('T')[0];
    const today = new Date(Date.now() - tzOffset).toISOString().split('T')[0];

    const [origin, setOrigin] = useState(FACILITIES[0].value);
    const [dest, setDest]     = useState(UNITS[0].value);
    const [schedDate, setSchedDate] = useState(tomorrow);
    const [schedTime, setSchedTime] = useState("08:30");
    const [altOptions, setAltOptions] = useState<NewShipmentTimeWindow[]>([]);

    if (!open) return null;

    const handleAdd = () => {
        onAdd({
            origin,
            destination: dest,
            scheduledDate: schedDate,
            scheduledTime: schedTime,
            alternateOptions: altOptions,
        });
    };

    const addOption = () => setAltOptions([...altOptions, { date: schedDate, time: "17:00" }]);
    const removeOption = (idx: number) => setAltOptions(altOptions.filter((_, i) => i !== idx));
    const updateOption = (idx: number, field: 'date'|'time', val: string) => {
        const newOpts = [...altOptions];
        newOpts[idx][field] = val;
        setAltOptions(newOpts);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-xs" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#c2410c] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                    </div>
                    <h3 className="text-[16px] font-bold text-gray-900">New Shipment</h3>
                </div>
                <div className="space-y-3 mb-5 max-h-[50vh] overflow-y-auto custom-scrollbar px-1">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Origin Facility</label>
                        <select value={origin} onChange={e => setOrigin(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c2410c]/30">
                            {FACILITIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Target Unit</label>
                        <select value={dest} onChange={e => setDest(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c2410c]/30">
                            {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Primary Target Time</label>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <input type="date" value={schedDate} min={today} onChange={e => setSchedDate(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-white focus:outline-none" />
                            </div>
                            <div className="w-1/3">
                                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-white focus:outline-none" />
                            </div>
                        </div>

                        {altOptions.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Alternate Time Windows</label>
                                {altOptions.map((opt, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <input type="date" value={opt.date} min={today} onChange={e => updateOption(idx, 'date', e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl px-2 py-2 text-[12px] font-semibold text-gray-900 bg-white focus:outline-none" />
                                        </div>
                                        <div className="w-1/3">
                                            <input type="time" value={opt.time} onChange={e => updateOption(idx, 'time', e.target.value)}
                                                className="w-full border border-slate-200 rounded-xl px-2 py-2 text-[12px] font-semibold text-gray-900 bg-white focus:outline-none" />
                                        </div>
                                        <button onClick={() => removeOption(idx)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 shrink-0">
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={addOption} className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-[11px] font-bold text-slate-500 flex items-center justify-center gap-1 hover:bg-slate-100">
                            <span className="material-symbols-outlined text-[14px]">add</span> Add Time Window
                        </button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 active:scale-95 transition-transform">Cancel</button>
                    <button onClick={handleAdd} className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold active:scale-95 transition-transform shadow-md">Add Shipment</button>
                </div>
            </div>
        </div>
    );
}
