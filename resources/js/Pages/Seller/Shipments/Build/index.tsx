import React, { useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import PartyDetailModal, { PartyKey } from "@/Components/Seller/PartyDetailModal";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/
interface Vehicle {
    id: string;
    name: string;
    plate: string;
    icon: string;
    max_cbm: number;
    payload_kg: number;
    bay: string | null;
    is_primary: boolean;
}

interface ManifestItem {
    id: number;
    name: string;
    sku: string;
    status: "oos" | "low" | "regular" | "sold";
    status_label: string;
    stock_qty: number | null;
    quantity: number;
    unit: string;
    cbm: number;
    weight_kg: number;
    location: string;
    icon: string;
    target_dest?: "store" | "remote_warehouse";
    added_by: {
        type: "auto" | "manual";
        name?: string;
        reason: string;
    };
}

interface Location {
    name: string;
    detail: string;
}

interface Props {
    transfer_id: number;
    origin: Location;
    destination: Location;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    vehicles: Vehicle[];
    manifest_items: ManifestItem[];
}

/* ----------------------------------------------------------
 | Static demo data
 |----------------------------------------------------------*/
const FACILITIES = [
    { value: "central-hub", label: "Central Hub — Kality Logistics Center" },
    { value: "piazza-hub",  label: "Piazza Hub — Piazza Terminal 01" },
    { value: "bole-hub",    label: "Bole Hub — Bole Logistics Center" },
];

const UNITS = [
    { value: "main-store",   label: "Main Store — Merkato Terminal 01" },
    { value: "branch-store", label: "Branch Store — Piazza Terminal 02" },
    { value: "bole-store",   label: "Bole Store — Bole Terminal 03" },
];

const AVAILABLE_SKUS: ManifestItem[] = [
    { id: 301, name: "Ballpoint Pens Box",    sku: "SKU-301", status: "low",     status_label: "LOW STOCK",    stock_qty: 8,  quantity: 20, unit: "Bx",  cbm: 0.4, weight_kg: 80, location: "Aisle C-02", icon: "warning", target_dest: "store", added_by: { type: "auto", reason: "Replenish algorithm" } },
    { id: 302, name: "Correction Fluid 12pk", sku: "SKU-302", status: "regular", status_label: "REGULAR",      stock_qty: 30, quantity: 30, unit: "Pk",  cbm: 0.3, weight_kg: 60, location: "Aisle C-03", icon: "inventory", target_dest: "remote_warehouse", added_by: { type: "manual", name: "Yonathan H.", reason: "Store request" } },
    { id: 303, name: "Stapler Set",            sku: "SKU-303", status: "oos",     status_label: "CRITICAL OOS", stock_qty: 0,  quantity: 15, unit: "Pcs", cbm: 0.5, weight_kg: 90, location: "Aisle A-01", icon: "report", target_dest: "store", added_by: { type: "auto", reason: "Zero stock" } },
    { id: 304, name: "Premium Notebook",       sku: "SKU-304", status: "sold",    status_label: "SOLD",         stock_qty: 0,  quantity: 5,  unit: "Bx",  cbm: 0.2, weight_kg: 40, location: "Aisle B-05", icon: "sell", target_dest: "remote_warehouse", added_by: { type: "auto", reason: "Order #4092 fulfilled" } },
];

/* ----------------------------------------------------------
 | Helpers
 |----------------------------------------------------------*/
function StatusBadge({ status, label }: { status: "oos" | "low" | "regular" | "sold"; label: string }) {
    const cls =
        status === "oos"     ? "bg-red-100 text-red-800" :
        status === "sold"    ? "bg-blue-100 text-blue-800" :
        status === "low"     ? "bg-amber-100 text-amber-800" :
                               "bg-slate-100 text-slate-600";
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide shrink-0 ${cls}`}>{label}</span>;
}

function ItemIcon({ icon }: { icon: string }) {
    const iconName = icon === "report" ? "error" : icon === "warning" ? "warning" : icon === "sell" ? "sell" : "inventory_2";
    const colorCls = icon === "report" ? "text-red-500" : icon === "warning" ? "text-amber-500" : icon === "sell" ? "text-blue-500" : "text-slate-500";
    return <span className={`material-symbols-outlined text-[18px] ${colorCls}`}>{iconName}</span>;
}

function CbmGauge({ percent }: { percent: number }) {
    const r    = 15.9155;
    const circ = 2 * Math.PI * r;
    const dash = (Math.min(percent, 100) / 100) * circ;
    const color = percent > 85 ? "#dc2626" : percent > 60 ? "#d97706" : "#c2410c";
    return (
        <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3.8" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke={color} strokeWidth="3.8"
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.4s ease" }} />
            </svg>
            <div style={{ position: "absolute", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color }}>{percent}%</div>
                <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", marginTop: 2 }}>Cubed</div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Edit Route Bottom Sheet
 |----------------------------------------------------------*/
function EditRouteSheet({ open, originName, destName, onClose, onSave }: {
    open: boolean; originName: string; destName: string;
    onClose: () => void; onSave: (o: Location, d: Location) => void;
}) {
    const [originVal, setOriginVal] = useState(
        FACILITIES.find(f => originName.startsWith(f.label.split("—")[0].trim()))?.value ?? FACILITIES[0].value
    );
    const [destVal, setDestVal] = useState(
        UNITS.find(u => destName.startsWith(u.label.split("—")[0].trim()))?.value ?? UNITS[0].value
    );
    if (!open) return null;
    const handleSave = () => {
        const o = FACILITIES.find(f => f.value === originVal)!;
        const d = UNITS.find(u => u.value === destVal)!;
        const [on, od] = o.label.split(" — ");
        const [dn, dd] = d.label.split(" — ");
        onSave({ name: on.trim(), detail: od?.trim() ?? "" }, { name: dn.trim(), detail: dd?.trim() ?? "" });
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                <h3 className="text-[16px] font-bold text-gray-900 mb-4">Edit Route</h3>
                <div className="space-y-3 mb-5">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Origin Facility</label>
                        <select value={originVal} onChange={e => setOriginVal(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none">
                            {FACILITIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Target Unit</label>
                        <select value={destVal} onChange={e => setDestVal(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none">
                            {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold">Save Route</button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Add Items Bottom Sheet
 |----------------------------------------------------------*/
function AddItemsSheet({ open, existingIds, onClose, onAdd }: {
    open: boolean; existingIds: number[];
    onClose: () => void; onAdd: (items: ManifestItem[]) => void;
}) {
    const available = AVAILABLE_SKUS.filter(s => !existingIds.includes(s.id));
    const [selected, setSelected] = useState<Record<number, { unit: string; dest: "store" | "remote_warehouse" }>>({});
    if (!open) return null;

    const toggle = (item: ManifestItem) =>
        setSelected(prev => {
            const n = { ...prev };
            if (n[item.id]) {
                delete n[item.id];
            } else {
                n[item.id] = { unit: "Box", dest: item.target_dest ?? "store" };
            }
            return n;
        });

    const handleAdd = () => {
        onAdd(available.filter(s => selected[s.id]).map(s => ({
            ...s,
            unit: selected[s.id].unit,
            target_dest: selected[s.id].dest,
        })));
        setSelected({});
        onClose();
    };

    const count = Object.keys(selected).length;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-10 max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 shrink-0" />
                <h3 className="text-[16px] font-bold text-gray-900 mb-1 shrink-0">Add Items to Manifest</h3>
                <p className="text-[11px] text-slate-400 mb-3 shrink-0">Assign packaging unit & target destination for each SKU</p>
                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                    {available.length === 0
                        ? <p className="text-[13px] text-slate-400 text-center py-6">All available SKUs are already in the manifest.</p>
                        : available.map(item => {
                            const isSel = !!selected[item.id];
                            return (
                                <div key={item.id} onClick={() => toggle(item)}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${isSel ? "border-[#c2410c] bg-orange-50/40" : "border-slate-100 bg-slate-50"}`}>
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSel ? "bg-[#c2410c] border-[#c2410c]" : "border-slate-300"}`}>
                                            {isSel && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                                        </div>
                                        <ItemIcon icon={item.icon} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-bold text-gray-900 truncate">{item.name}</p>
                                            <p className="text-[10px] font-mono text-slate-400">{item.sku} • {item.location}</p>
                                        </div>
                                        <StatusBadge status={item.status} label={item.status_label} />
                                    </div>
                                    {isSel && (
                                        <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200 space-y-2" onClick={e => e.stopPropagation()}>
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Packaging Unit:</p>
                                                <div className="flex gap-1.5">
                                                    {["Pcs", "Box", "Carton"].map(u => (
                                                        <button key={u}
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setSelected(p => ({ ...p, [item.id]: { ...(p[item.id] || { dest: "store" }), unit: u } })); }}
                                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${selected[item.id]?.unit === u ? "bg-[#c2410c] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                                                            {u === "Pcs" ? "Pcs (1)" : u === "Box" ? "Box (12)" : "Carton (48)"}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Target Destination (Dual Support):</p>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={e => { e.stopPropagation(); setSelected(p => ({ ...p, [item.id]: { ...(p[item.id] || { unit: "Box" }), dest: "store" } })); }}
                                                        className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1 ${
                                                            selected[item.id]?.dest !== "remote_warehouse"
                                                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">storefront</span>
                                                        Main Store
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={e => { e.stopPropagation(); setSelected(p => ({ ...p, [item.id]: { ...(p[item.id] || { unit: "Box" }), dest: "remote_warehouse" } })); }}
                                                        className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1 ${
                                                            selected[item.id]?.dest === "remote_warehouse"
                                                                ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                                                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">warehouse</span>
                                                        Remote Warehouse
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    }
                </div>
                <div className="flex gap-2 mt-4 shrink-0 pt-4 border-t border-slate-100 pb-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600">Cancel</button>
                    <button onClick={handleAdd} disabled={count === 0}
                        className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold disabled:opacity-40">
                        Add {count > 0 ? `(${count})` : ""} Items
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Move Item Bottom Sheet
 |----------------------------------------------------------*/
function MoveItemSheet({ open, item, onClose, onMove }: {
    open: boolean; item: ManifestItem | null;
    onClose: () => void; onMove: (itemId: number, direction: "prev"|"next") => void;
}) {
    if (!open || !item) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                <h3 className="text-[16px] font-bold text-gray-900 mb-1">Move Item</h3>
                <p className="text-[12px] text-slate-500 mb-5">Move <strong className="text-gray-800">{item.name}</strong> to an adjacent scheduled shipment.</p>
                <div className="flex gap-2 mb-2">
                    <button onClick={() => { onMove(item.id, "prev"); onClose(); }}
                        className="flex-1 py-3.5 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-700 bg-slate-50 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform">
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                        Previous Run
                    </button>
                    <button onClick={() => { onMove(item.id, "next"); onClose(); }}
                        className="flex-1 py-3.5 rounded-xl border border-slate-200 text-[13px] font-bold text-slate-700 bg-slate-50 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform">
                        <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                        Next Run
                    </button>
                </div>
                <button onClick={onClose} className="w-full py-3 mt-4 mb-4 rounded-xl text-[13px] font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100">Cancel</button>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function SellerShipmentsIndex({
    transfer_id, origin: originProp, destination: destinationProp,
    distance_km, scheduled_run, cutoff_label, vehicles, manifest_items: initialItems,
}: Props) {
    const [selectedVehicle, setSelectedVehicle] = useState(
        vehicles.find(v => v.is_primary)?.id ?? vehicles[0]?.id
    );
    const [driver, setDriver] = useState("auto");
    const [scheduleInput, setScheduleInput] = useState(scheduled_run);
    const [items,      setItems]      = useState<ManifestItem[]>(initialItems);
    const [quantities, setQuantities] = useState<Record<number, number>>(
        Object.fromEntries(initialItems.map(i => [i.id, i.quantity]))
    );
    const [origin,      setOrigin]      = useState(originProp);
    const [destination, setDestination] = useState(destinationProp);

    const [editRouteOpen, setEditRouteOpen] = useState(false);
    const [addItemsOpen,  setAddItemsOpen]  = useState(false);
    const [moveItem,      setMoveItem]      = useState<ManifestItem | null>(null);
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);

    const activeVehicle  = vehicles.find(v => v.id === selectedVehicle);
    const maxCbm         = activeVehicle?.max_cbm  ?? 14.5;
    const maxKg          = activeVehicle?.payload_kg ?? 4200;
    const totalCbm       = items.reduce((s, i) => s + i.cbm       * ((quantities[i.id] ?? 0) / i.quantity), 0);
    const totalKg        = items.reduce((s, i) => s + i.weight_kg  * ((quantities[i.id] ?? 0) / i.quantity), 0);
    const cbmPercent     = Math.min(Math.round((totalCbm / maxCbm) * 100), 100);
    const kgPercent      = Math.min(Math.round((totalKg  / maxKg)  * 100), 100);
    const totalCartons   = Object.values(quantities).reduce((a, b) => a + b, 0);

    const hasStoreDest = items.some(i => (i.target_dest ?? "store") === "store");
    const hasRemoteWHDest = items.some(i => i.target_dest === "remote_warehouse");
    const isDualDest = hasStoreDest && hasRemoteWHDest;

    const handleToggleDest = (id: number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const nextDest = (item.target_dest ?? "store") === "store" ? "remote_warehouse" : "store";
                return { ...item, target_dest: nextDest };
            }
            return item;
        }));
    };

    const handleQty         = (id: number, delta: number) =>
        setQuantities(p => ({ ...p, [id]: Math.max(0, (p[id] ?? 0) + delta) }));
    const handleAddItems    = (newItems: ManifestItem[]) => {
        // Mock default added_by for newly added items
        const newItemsWithAdder = newItems.map(i => ({ ...i, added_by: i.added_by || { type: "manual", name: "You", reason: "Manual addition" } }));
        setItems(p => [...p, ...newItemsWithAdder]);
        setQuantities(p => ({ ...p, ...Object.fromEntries(newItemsWithAdder.map(i => [i.id, i.quantity])) }));
    };
    const handleRemoveItem  = (id: number) => {
        setItems(p => p.filter(i => i.id !== id));
        setQuantities(p => { const n = { ...p }; delete n[id]; return n; });
    };
    const handleMoveItem    = (itemId: number, direction: "prev"|"next") => {
        alert(`Item moved to ${direction} shipment run.`);
        handleRemoveItem(itemId);
    };

    const loadLabel = cbmPercent <= 40 ? "Under Capacity" : cbmPercent <= 75 ? "Optimal Load" : "Near Capacity";
    const loadCls   = cbmPercent <= 40 ? "bg-emerald-100 text-emerald-800" : cbmPercent <= 75 ? "bg-orange-100 text-[#c2410c]" : "bg-red-100 text-red-800";

    return (
        <>
            <Head title="Build Shipment">
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
            </Head>

            {/* ── Sticky Top Context Strip ── */}
            <div className="px-4 pt-3 pb-2.5 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            if (window.history.length > 1) {
                                window.history.back();
                            } else {
                                router.visit(route("seller.shipments.index"));
                            }
                        }}
                        className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center mr-1 active:scale-95 transition-all text-slate-600"
                        aria-label="Back"
                    >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    </button>
                    <span className="material-symbols-outlined text-[#c2410c] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Build Shipment</p>
                        <p className="text-[15px] font-bold text-gray-900 leading-tight">Phase 1 of 3 — Manifest</p>
                    </div>
                </div>
            </div>

            {/* Content Container (lots of bottom padding to clear the double action bars) */}
            <div className="px-3.5 pt-3 pb-52 space-y-3">

                {/* ── Phase Stepper ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
                    <div className="flex items-center">
                        {[
                            { n: 1, label: "Manifest", sub: "Active"  },
                            { n: 2, label: "Review",   sub: "Pending" },
                            { n: 3, label: "Dispatch", sub: "Pending" },
                        ].map((step, i) => (
                            <React.Fragment key={step.n}>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${step.n === 1 ? "bg-[#c2410c] text-white" : "bg-slate-100 text-slate-400"}`}>
                                        {step.n}
                                    </div>
                                    <div>
                                        <p className={`text-[11px] font-bold leading-none ${step.n === 1 ? "text-[#c2410c]" : "text-slate-400"}`}>{step.label}</p>
                                        <p className={`text-[9px] leading-none mt-0.5 ${step.n === 1 ? "text-[#c2410c]/70" : "text-slate-300"}`}>{step.sub}</p>
                                    </div>
                                </div>
                                {i < 2 && <div className="flex-1 h-0.5 mx-2 bg-slate-100" />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* ── Route Matrix Card ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Replenishment Corridor</p>
                        <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-[#c2410c] text-[10px] font-bold">WH → Retail</span>
                            <button onClick={() => setEditRouteOpen(true)}
                                className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                                <span className="material-symbols-outlined text-[14px] text-slate-500">edit</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 mb-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1 mb-0.5">
                                <span className="material-symbols-outlined text-[11px]">warehouse</span> Origin
                            </p>
                            <p className="text-[13px] font-bold text-gray-900 truncate">{origin.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{origin.detail}</p>
                        </div>
                        <div className="flex flex-col items-center shrink-0">
                            <span className="material-symbols-outlined text-[#c2410c] text-[18px]">arrow_forward</span>
                            <span className="text-[9px] text-slate-400">{distance_km} km</span>
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                            <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center justify-end gap-1 mb-0.5">
                                Target <span className="material-symbols-outlined text-[11px]">storefront</span>
                            </p>
                            <p className="text-[13px] font-bold text-gray-900 truncate">{destination.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{destination.detail}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#c2410c] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-white text-[16px]">schedule</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] text-slate-400 mb-0.5">Scheduled Time</p>
                                <input type="datetime-local" value={scheduleInput}
                                    onChange={e => setScheduleInput(e.target.value)}
                                    className="text-[13px] font-bold text-gray-900 bg-transparent border-none outline-none w-full" />
                            </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">{cutoff_label}</span>
                    </div>

                    {/* Proposed Scheduled Run Time Gap Options */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 mb-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-slate-700">Proposed Time Gap Windows:</p>
                            <span className="text-[9px] text-[#c2410c] font-semibold">Multi-Party Agreement</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                "10/25/2024, 08:30 AM",
                                "10/25/2024, 05:00 PM",
                                "10/26/2024, 08:30 AM",
                                "10/26/2024, 05:00 PM",
                            ].map((slotOpt, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setScheduleInput(idx === 0 ? "2024-10-25T08:30" : idx === 1 ? "2024-10-25T17:00" : idx === 2 ? "2024-10-26T08:30" : "2024-10-26T17:00")}
                                    className="p-1.5 bg-white border border-slate-200/80 rounded-lg text-left text-[10px] font-mono hover:border-[#c2410c] active:scale-95 transition-all text-slate-700 hover:text-[#c2410c]"
                                >
                                    <span className="text-[8px] font-bold uppercase text-slate-400 block">Window {idx + 1}</span>
                                    {slotOpt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-blue-50/60 flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-blue-500 shrink-0 mt-0.5">info</span>
                        <p className="text-[11px] text-slate-500 leading-snug">
                            <strong className="text-gray-700">Route Protocol:</strong> Remote WH → Store routes auto-assign 3PL transit; local transfer requires manual fleet allocation.
                        </p>
                    </div>
                </div>

                {/* ── 4-Party Inbound Agreement Gate ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[13px] font-bold text-gray-900">4-Party Inbound Agreement Gate</p>
                            <p className="text-[10px] text-slate-400">
                                {isDualDest ? "Dual Destination: Store SK + Remote WH SK both required" : "Tap any party to view details"}
                            </p>
                        </div>
                        <span className="text-[10px] font-bold text-[#c2410c] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200/50">
                            {isDualDest ? "DUAL DEST (2 SKS)" : "ALL 4 REQUIRED"}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                        {[
                            { key: "creator" as PartyKey,     label: "1. Creator", sub: "Drafting",  icon: "person",         agreed: false },
                            { key: "fleet" as PartyKey,       label: "2. Fleet",   sub: "Carrier",   icon: "local_shipping", agreed: driver === "d1" },
                            { key: "origin" as PartyKey,      label: "3. Origin",  sub: "Depot",     icon: "warehouse",      agreed: false },
                            { key: "destination" as PartyKey, label: "4. Dest.",   sub: isDualDest ? "2 SKs (Dual)" : "Store", icon: "storefront", agreed: false },
                        ].map((p, idx) => {
                            const color = p.agreed ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200";
                            return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setActivePartyModal(p.key)}
                                className={`flex flex-col items-center p-1.5 rounded-xl border text-center transition-all cursor-pointer hover:shadow-xs active:scale-95 ${
                                    p.agreed ? 'border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100/60' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                                }`}
                            >
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 border ${color}`}>
                                    <span className="material-symbols-outlined text-[12px]">{p.icon}</span>
                                </div>
                                <span className={`text-[8px] font-bold leading-tight w-full truncate ${p.agreed ? 'text-emerald-900' : 'text-gray-500'}`}>{p.label}</span>
                                <span className="text-[7px] text-slate-400 leading-tight w-full truncate">{p.sub}</span>
                                <div className="mt-1 flex items-center justify-center w-full">
                                    {p.agreed 
                                        ? <span className="material-symbols-outlined text-[12px] text-emerald-600">check_circle</span> 
                                        : <span className="material-symbols-outlined text-[12px] text-slate-300">hourglass_empty</span>
                                    }
                                </div>
                            </button>
                        )})}
                    </div>
                </div>

                {/* ── Party Detail Modal Window (Opens on click for each party) ── */}
                <PartyDetailModal
                    open={activePartyModal !== null}
                    activeParty={activePartyModal ?? "creator"}
                    onClose={() => setActivePartyModal(null)}
                    onSelectParty={setActivePartyModal}
                    reference={`RPL-BUILD-${transfer_id}`}
                    scheduleOptions={[
                        "10/25/2024, 08:30 AM",
                        "10/25/2024, 05:00 PM",
                        "10/26/2024, 08:30 AM",
                        "10/26/2024, 05:00 PM",
                    ]}
                    agreements={{
                        creator: {
                            title: "1. Creator",
                            role: "Seller",
                            party: "Admin • Today • 06:14 AM",
                            status: "pending",
                            status_label: "Drafting / Pending Dispatch",
                            detail: "Manifest is being constructed by Admin. Only ticked off as Created once reviewed and dispatched.",
                        },
                        fleet: {
                            title: "2. Fleet",
                            role: "Carrier",
                            party: `${activeVehicle?.name} • ${activeVehicle?.plate}`,
                            status: driver === "d1" ? "accepted" : driver === "d2" ? "rescheduled" : "pending",
                            status_label: driver === "d1" ? "Driver Accepted" : driver === "d2" ? "Rescheduled" : "Pending Driver",
                            detail: driver === "d1"
                                ? "Driver Abebe K. accepted assigned vehicle and scheduled route."
                                : driver === "d2"
                                ? "Driver Chala M. requested reschedule to 10/25/2024, 05:00 PM (En route delay)."
                                : "Auto-dispatch enabled; awaiting driver confirmation.",
                        },
                        origin: {
                            title: "3. Origin",
                            role: "Depot",
                            party: `${origin.name} (${origin.detail})`,
                            status: "pending",
                            status_label: "Pending Stock Keeper",
                            detail: "Stock Keeper Dawit T. — Bay reserved; awaiting picking & staging sign-off.",
                        },
                        destination: isDualDest ? {
                            title: "4. Dest.",
                            role: "Store & Remote WH",
                            party: `${destination.name} + Remote Warehouse`,
                            status: "pending",
                            status_label: "Pending 2 Stock Keepers",
                            detail: "Manifest has items going to both Store Floor and Remote WH. Both Stock Keepers must accept.",
                            stock_keepers: [
                                {
                                    name: "Main Store (Floor)",
                                    location: destination.name,
                                    role: "Store Stock Keeper",
                                    keeper: "Helen M.",
                                    status: "pending",
                                    status_label: "Pending Stock Keeper",
                                    detail: "Store Receiver standing by for floor staging clearance.",
                                },
                                {
                                    name: "Remote Warehouse (Overflow)",
                                    location: "Kality Sector 3 Overflow",
                                    role: "Remote WH Stock Keeper",
                                    keeper: "Blen A.",
                                    status: "pending",
                                    status_label: "Pending Stock Keeper",
                                    detail: "Remote warehouse stock keeper sign-off required for inbound overflow.",
                                },
                            ],
                        } : {
                            title: "4. Dest.",
                            role: hasRemoteWHDest ? "Remote WH" : "Store",
                            party: hasRemoteWHDest ? "Remote Warehouse (Overflow Depot)" : `${destination.name} (${destination.detail})`,
                            status: "pending",
                            status_label: "Pending Stock Keeper",
                            detail: hasRemoteWHDest
                                ? "Stock Keeper Blen A. — Awaiting overflow depot clearance."
                                : "Store Receiver Helen M. — Awaiting inbound corridor clearance.",
                        },
                    }}
                />

                {/* ── Vehicle & Driver Selection ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[#c2410c] text-[18px]">local_shipping</span>
                            <p className="text-[13px] font-bold text-gray-900">Dedicated Fleet Carrier</p>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400">{vehicles.length} Available</span>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                        {vehicles.map(v => {
                            const sel = selectedVehicle === v.id;
                            return (
                                <div key={v.id} onClick={() => setSelectedVehicle(v.id)}
                                    className={`relative p-3 rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${sel ? "border-[#c2410c] bg-orange-50/30" : "border-slate-100 bg-slate-50 opacity-70"}`}>
                                    {sel && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#c2410c]" />}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sel ? "bg-[#c2410c]" : "bg-slate-200"}`}>
                                                <span className={`material-symbols-outlined text-[20px] ${sel ? "text-white" : "text-slate-500"}`}>
                                                    {v.icon === "directions_car" ? "directions_car" : "local_shipping"}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-bold text-gray-900 truncate">{v.name}</p>
                                                <p className="text-[10px] font-mono text-slate-400">Plate: {v.plate}</p>
                                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                    <span className="px-1.5 py-0.5 rounded border border-slate-200 text-[9px] text-slate-500">{v.max_cbm} CBM</span>
                                                    <span className="px-1.5 py-0.5 rounded border border-slate-200 text-[9px] text-slate-500">{v.payload_kg.toLocaleString()} kg</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${sel ? "bg-[#c2410c]" : "bg-slate-200"}`}>
                                            <span className={`material-symbols-outlined text-[13px] ${sel ? "text-white" : "text-slate-400"}`}>
                                                {sel ? "check" : "add"}
                                            </span>
                                        </div>
                                    </div>
                                    {sel && v.bay && (
                                        <div className="mt-2 px-3 py-1.5 bg-white rounded-lg flex items-center justify-between border border-slate-100">
                                            <span className="text-[10px] text-slate-400">Bay Status</span>
                                            <div className="flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#c2410c]" />
                                                <span className="text-[10px] font-mono font-bold text-[#c2410c]">{v.bay} RESERVED</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Driver Assignment Subsection */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 block">Assign Driver for this Fleet</label>
                        <select value={driver} onChange={e => setDriver(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-gray-900 bg-slate-50 focus:outline-none focus:border-[#c2410c] transition-colors">
                            <option value="auto">Open to Any Driver (Auto-dispatch & accept)</option>
                            <option value="d1">Abebe K. — (Available Now)</option>
                            <option value="d2">Chala M. — (Currently On Route)</option>
                        </select>
                    </div>
                </div>

                {/* ── Volumetric Load Telemetry ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[#c2410c] text-[18px]">view_in_ar</span>
                            <p className="text-[13px] font-bold text-gray-900">Volumetric Load Telemetry</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${loadCls}`}>{loadLabel} ({cbmPercent}%)</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <CbmGauge percent={cbmPercent} />
                        <div className="flex-1 min-w-0 space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-semibold text-slate-500">Volume</span>
                                    <span className="text-[11px] font-bold font-mono text-gray-800">{totalCbm.toFixed(1)} / {maxCbm} m³</span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${cbmPercent > 85 ? "bg-red-500" : "bg-[#c2410c]"}`}
                                        style={{ width: `${cbmPercent}%` }} />
                                </div>
                                <p className="text-[10px] font-bold text-[#c2410c] mt-0.5">{(maxCbm - totalCbm).toFixed(1)} CBM Remaining</p>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-semibold text-slate-500">Mass</span>
                                    <span className="text-[11px] font-bold font-mono text-gray-800">{Math.round(totalKg).toLocaleString()} / {maxKg.toLocaleString()} kg</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${kgPercent > 90 ? "bg-red-500" : "bg-slate-400"}`}
                                        style={{ width: `${kgPercent}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 text-center gap-2">
                        {[
                            { label: "SKUs",      value: items.length },
                            { label: "Cartons",   value: totalCartons },
                            { label: "Pallet Eq", value: (totalCbm / 2.07).toFixed(1) },
                        ].map(s => (
                            <div key={s.label}>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
                                <p className="text-[17px] font-bold text-gray-900">{s.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Replenishment Manifest ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-[13px] font-bold text-gray-900">Replenishment Manifest</p>
                            <p className="text-[10px] text-slate-400">Calculated from inventory velocity</p>
                        </div>
                        <button onClick={() => setAddItemsOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#c2410c] text-white text-[12px] font-bold active:scale-95 transition-transform shrink-0">
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            Add Items
                        </button>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-700 text-[11px] font-semibold bg-red-50">
                                <span className="material-symbols-outlined text-[13px]">priority_high</span>
                                Priority: OOS First
                            </div>
                            <button onClick={() => alert("OOS (Out of Stock) items are given highest priority for replenishment runs to prevent lost sales.")} 
                                className="w-6 h-6 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
                                <span className="material-symbols-outlined text-[13px]">info</span>
                            </button>
                        </div>
                        <button onClick={() => setQuantities(Object.fromEntries(initialItems.map(i => [i.id, i.quantity])))}
                            className="flex items-center gap-1 text-red-400 text-[11px] font-medium">
                            <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                            Reset
                        </button>
                    </div>

                    <div className="space-y-2.5">
                        {items.map(item => (
                            <div key={item.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-start gap-2 min-w-0">
                                        <div className={`w-9 h-9 mt-0.5 rounded-xl flex items-center justify-center shrink-0 ${item.status === "oos" ? "bg-red-100" : item.status === "low" ? "bg-amber-100" : item.status === "sold" ? "bg-blue-100" : "bg-slate-100"}`}>
                                            <ItemIcon icon={item.icon} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[12px] font-bold text-gray-900 truncate">{item.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                <span className="text-[10px] font-mono text-slate-400">{item.sku}</span>
                                                <StatusBadge status={item.status}
                                                    label={item.status === "oos"
                                                        ? `${item.status_label} (0)`
                                                        : item.status === "sold" 
                                                        ? item.status_label
                                                        : `${item.status_label} (${item.stock_qty})`
                                                    }
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleDest(item.id)}
                                                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border transition-colors flex items-center gap-0.5 cursor-pointer ${
                                                        (item.target_dest ?? "store") === "remote_warehouse"
                                                            ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                                                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                                    }`}
                                                    title="Click to toggle destination between Store and Remote Warehouse"
                                                >
                                                    <span className="material-symbols-outlined text-[10px]">
                                                        {(item.target_dest ?? "store") === "remote_warehouse" ? "warehouse" : "storefront"}
                                                    </span>
                                                    {(item.target_dest ?? "store") === "remote_warehouse" ? "To: Remote WH" : "To: Store Floor"}
                                                </button>
                                            </div>
                                            {/* Who added it / reason row */}
                                            {item.added_by && (
                                                <div className="flex items-center gap-1 bg-slate-100/80 px-2 py-1 rounded mt-1.5 w-fit border border-slate-200/50">
                                                    <span className={`material-symbols-outlined text-[11px] ${item.added_by.type === 'auto' ? 'text-blue-500' : 'text-emerald-500'}`}>
                                                        {item.added_by.type === 'auto' ? 'smart_toy' : 'person'}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500 font-medium">
                                                        {item.added_by.type === 'auto' ? 'Auto-added:' : `Added by ${item.added_by.name}:`} <span className="text-slate-700">{item.added_by.reason}</span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[13px] font-bold text-[#c2410c]">{quantities[item.id]} {item.unit}</p>
                                        <p className="text-[10px] font-mono text-slate-400">
                                            {(item.cbm * (quantities[item.id] ?? 0) / item.quantity).toFixed(1)} CBM
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-slate-100 mt-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="material-symbols-outlined text-[13px] text-slate-400 shrink-0">warehouse</span>
                                        <span className="text-[11px] text-slate-500 truncate">{item.location}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => setMoveItem(item)}
                                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-slate-100" title="Move item to another run">
                                            <span className="material-symbols-outlined text-[13px] text-slate-400">swap_horiz</span>
                                        </button>
                                        <button onClick={() => handleRemoveItem(item.id)}
                                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-50" title="Remove item">
                                            <span className="material-symbols-outlined text-[13px] text-red-400">delete_outline</span>
                                        </button>
                                        <button onClick={() => handleQty(item.id, -1)}
                                            className="w-6 h-6 rounded-lg border border-slate-200 bg-white flex items-center justify-center active:bg-slate-100">
                                            <span className="material-symbols-outlined text-[13px] text-slate-600">remove</span>
                                        </button>
                                        <span className="text-[13px] font-bold font-mono text-gray-900 min-w-[22px] text-center">
                                            {quantities[item.id]}
                                        </span>
                                        <button onClick={() => handleQty(item.id, 1)}
                                            className="w-6 h-6 rounded-lg border border-slate-200 bg-white flex items-center justify-center active:bg-slate-100">
                                            <span className="material-symbols-outlined text-[13px] text-slate-600">add</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* ── Fixed Bottom Actions Layer (Positioned ABOVE the SellerLayout Bottom Nav) ── */}
            <div className="fixed left-0 right-0 z-40 bg-gradient-to-t from-white via-white/95 to-transparent pt-8 pb-3 px-4 pointer-events-none" style={{ bottom: "calc(85px + env(safe-area-inset-bottom, 0px))" }}>
                <div className="max-w-[425px] mx-auto flex items-center justify-between gap-3 pointer-events-auto">
                    <div className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-2 rounded-2xl shadow-lg shrink-0">
                        <span className="material-symbols-outlined text-[18px] text-emerald-400">speed</span>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide leading-none mb-0.5">Volumetric Load</span>
                            <span className="text-[10px] font-bold tracking-wide leading-none">Telemetry</span>
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xl px-3 py-2 flex items-center justify-between gap-2 min-w-0 pointer-events-auto">
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-1 truncate">
                                <span className="text-[14px] font-bold text-[#c2410c]">{totalCbm.toFixed(1)} CBM</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300 inline-block shrink-0" />
                                <span className="text-[13px] font-bold text-gray-900">{items.length} SKUs</span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">{Math.round(totalKg).toLocaleString()} kg • {activeVehicle?.name ?? "No vehicle"}</p>
                        </div>
                        <button 
                            onClick={() => router.get(route("seller.shipments.review", transfer_id), { vehicle_id: selectedVehicle, quantities })}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#c2410c] text-white font-bold text-[12px] shadow-md shrink-0 active:scale-95 transition-transform">
                            Review
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Bottom Sheets ── */}
            <EditRouteSheet
                open={editRouteOpen}
                originName={origin.name}
                destName={destination.name}
                onClose={() => setEditRouteOpen(false)}
                onSave={(o, d) => { setOrigin(o); setDestination(d); setEditRouteOpen(false); }}
            />
            <AddItemsSheet
                open={addItemsOpen}
                existingIds={items.map(i => i.id)}
                onClose={() => setAddItemsOpen(false)}
                onAdd={handleAddItems}
            />
            <MoveItemSheet
                open={!!moveItem}
                item={moveItem}
                onClose={() => setMoveItem(null)}
                onMove={(id, direction) => handleMoveItem(id, direction)}
            />
        </>
    );
}

SellerShipmentsIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;