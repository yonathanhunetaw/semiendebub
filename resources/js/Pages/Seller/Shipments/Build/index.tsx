import React, { useMemo, useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import PartyDetailModal from "@/Components/Seller/PartyDetailModal";
import type {
    CourierInfo,
    Location,
    LocationOption,
    ManifestItem,
    ManifestItemStatus,
    MoveTarget,
    PartyGateProps,
    PartyKey,
    Vehicle,
    VariantOption,
} from "@/types/shipments";

/* ----------------------------------------------------------
 | Types
 |----------------------------------------------------------*/

/** A line the Add Items sheet is about to send to the server. */
interface NewManifestLine {
    item_variant_id: number;
    quantity: number;
    unit: string;
}

interface Props extends PartyGateProps {
    transfer_id: number;
    reference: string;
    origin: Location;
    destination: Location;
    origin_store_id: number;
    destination_store_id: number;
    distance_km: number;
    scheduled_run: string;
    cutoff_label: string;
    vehicles: Vehicle[];
    manifest_items: ManifestItem[];
    /** Every facility, either end of the run (legacy). */
    stores: LocationOption[];
    /** From Main Hub A/B to a store or a Remote Hub, as location ids. */
    locations?: { origins: LocationOption[]; destinations: LocationOption[] };
    origin_location_id?: number | null;
    destination_location_id?: number | null;
    /** SKUs that may go on the manifest. */
    variants: VariantOption[];
    /** Other open runs from this origin, for the Move Item sheet. */
    move_targets: MoveTarget[];
    /** The driver, once the fleet party has taken the run. */
    courier: CourierInfo | null;
    can_edit_manifest: boolean;
}

/** Packaging units the Add Items sheet offers. */
const PACK_UNITS = ["Pcs", "Box", "Carton"] as const;

/**
 * The real lifecycle stage, in the seller's words.
 *
 * A run does not sit still while the seller is on this screen: the origin keeper
 * picks it, the driver takes it out, the receiving dock signs it off. Naming the
 * stage here is how the seller sees that without leaving the page.
 */
const STAGE_LABELS: Record<string, string> = {
    draft: "Draft",
    pending_agreement: "Awaiting agreement",
    scheduled: "Scheduled",
    picking: "Origin picking",
    ready: "Picked & staged",
    dispatched: "Left the origin",
    in_transit: "On the road",
    delivered: "Delivered — confirm receipt",
    received: "Received",
    cancelled: "Cancelled",
};

/* ----------------------------------------------------------
 | Helpers
 |----------------------------------------------------------*/
function StatusBadge({ status, label }: { status: ManifestItemStatus; label: string }) {
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
function EditRouteSheet({ open, origins, destinations, originId, destId, submitting, onClose, onSave }: {
    open: boolean;
    /** Main Hubs A/B. */
    origins: LocationOption[];
    /** Store floors and Remote Hubs. */
    destinations: LocationOption[];
    originId: number;
    destId: number;
    submitting: boolean;
    onClose: () => void;
    onSave: (originId: number, destId: number) => void;
}) {
    const [originVal, setOriginVal] = useState(String(originId));
    const [destVal, setDestVal] = useState(String(destId));
    if (!open) return null;

    const sameEnds = originVal === destVal;
    const handleSave = () => onSave(Number(originVal), Number(destVal));
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
                            {origins.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">Destination Facility</label>
                        <select value={destVal} onChange={e => setDestVal(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-gray-900 bg-slate-50 focus:outline-none">
                            {destinations.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>
                {/* Rerouting withdraws the other parties' consent, so say so before
                    the seller commits rather than after. */}
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-1.5 mb-4">
                    <span className="material-symbols-outlined text-[15px] text-amber-600 shrink-0 mt-0.5">warning</span>
                    <p className="text-[11px] text-amber-900 leading-snug">
                        Changing either end asks the driver, origin dock and receiving dock to agree again.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600">Cancel</button>
                    <button onClick={handleSave} disabled={sameEnds || submitting}
                        className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold disabled:opacity-40">
                        {sameEnds ? "Pick two facilities" : submitting ? "Saving…" : "Save Route"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Add Items Bottom Sheet
 |----------------------------------------------------------*/
function AddItemsSheet({ open, variants, existingIds, submitting, onClose, onAdd }: {
    open: boolean;
    variants: VariantOption[];
    existingIds: number[];
    submitting: boolean;
    onClose: () => void;
    onAdd: (lines: NewManifestLine[]) => void;
}) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Record<number, { unit: string; quantity: number }>>({});

    const available = useMemo(() => {
        const term = search.trim().toLowerCase();

        return variants
            .filter(v => !existingIds.includes(v.id))
            .filter(v => term === ""
                || v.label.toLowerCase().includes(term)
                || (v.sku ?? "").toLowerCase().includes(term));
    }, [variants, existingIds, search]);

    if (!open) return null;

    const toggle = (variant: VariantOption) =>
        setSelected(prev => {
            const next = { ...prev };
            if (next[variant.id]) {
                delete next[variant.id];
            } else {
                next[variant.id] = { unit: "Box", quantity: 1 };
            }
            return next;
        });

    const setLine = (id: number, patch: Partial<{ unit: string; quantity: number }>) =>
        setSelected(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

    const handleAdd = () => {
        const lines: NewManifestLine[] = Object.entries(selected).map(([id, line]) => ({
            item_variant_id: Number(id),
            quantity: Math.max(1, line.quantity),
            unit: line.unit,
        }));

        if (lines.length === 0) return;

        onAdd(lines);
        setSelected({});
    };

    const count = Object.keys(selected).length;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-10 max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 shrink-0" />
                <h3 className="text-[16px] font-bold text-gray-900 mb-1 shrink-0">Add Items to Manifest</h3>
                <p className="text-[11px] text-slate-400 mb-3 shrink-0">Set a packaging unit and carton count for each SKU</p>

                <div className="relative mb-3 shrink-0">
                    <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search product or SKU"
                        className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-gray-900 bg-slate-50 focus:outline-none focus:border-[#c2410c]"
                    />
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                    {available.length === 0
                        ? (
                            <p className="text-[13px] text-slate-400 text-center py-6">
                                {variants.length === 0
                                    ? "No product variants are set up yet."
                                    : search.trim() !== ""
                                    ? "No SKU matches that search."
                                    : "Every available SKU is already on the manifest."}
                            </p>
                        )
                        : available.map(variant => {
                            const line = selected[variant.id];
                            const isSel = !!line;
                            return (
                                <div key={variant.id} onClick={() => toggle(variant)}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${isSel ? "border-[#c2410c] bg-orange-50/40" : "border-slate-100 bg-slate-50"}`}>
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSel ? "bg-[#c2410c] border-[#c2410c]" : "border-slate-300"}`}>
                                            {isSel && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                                        </div>
                                        <ItemIcon icon="inventory" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-bold text-gray-900 truncate">{variant.label}</p>
                                            <p className="text-[10px] font-mono text-slate-400">{variant.sku ?? "No SKU"}</p>
                                        </div>
                                    </div>
                                    {isSel && (
                                        <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200 space-y-2" onClick={e => e.stopPropagation()}>
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Packaging Unit:</p>
                                                <div className="flex gap-1.5">
                                                    {PACK_UNITS.map(u => (
                                                        <button key={u}
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setLine(variant.id, { unit: u }); }}
                                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${line.unit === u ? "bg-[#c2410c] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                                                            {u}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Quantity:</p>
                                                <div className="flex items-center gap-1.5">
                                                    <button type="button"
                                                        onClick={e => { e.stopPropagation(); setLine(variant.id, { quantity: Math.max(1, line.quantity - 1) }); }}
                                                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[14px] text-slate-600">remove</span>
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={line.quantity}
                                                        onClick={e => e.stopPropagation()}
                                                        onChange={e => setLine(variant.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                                        className="w-16 text-center border border-slate-200 rounded-lg py-1 text-[12px] font-bold font-mono text-gray-900 bg-white focus:outline-none"
                                                    />
                                                    <button type="button"
                                                        onClick={e => { e.stopPropagation(); setLine(variant.id, { quantity: line.quantity + 1 }); }}
                                                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[14px] text-slate-600">add</span>
                                                    </button>
                                                    <span className="text-[10px] text-slate-400 ml-1">{line.unit}</span>
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
                    <button onClick={handleAdd} disabled={count === 0 || submitting}
                        className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold disabled:opacity-40">
                        {submitting ? "Adding…" : `Add ${count > 0 ? `(${count})` : ""} Items`}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Move Item Bottom Sheet
 |----------------------------------------------------------*/
function MoveItemSheet({ open, item, targets, submitting, onClose, onMove }: {
    open: boolean;
    item: ManifestItem | null;
    targets: MoveTarget[];
    submitting: boolean;
    onClose: () => void;
    onMove: (variantId: number, targetShipmentId: number) => void;
}) {
    const [target, setTarget] = useState<string>("");

    if (!open || !item) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-[425px] bg-white rounded-t-3xl p-5 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                <h3 className="text-[16px] font-bold text-gray-900 mb-1">Move Item</h3>
                <p className="text-[12px] text-slate-500 mb-4">
                    Move <strong className="text-gray-800">{item.name}</strong> onto another run leaving this origin.
                </p>

                {/* Only open runs from the same dock can take the line, so the
                    server decides what is on offer here. */}
                {targets.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center mb-4">
                        <span className="material-symbols-outlined text-slate-300 text-[28px]">route</span>
                        <p className="text-[12px] font-bold text-gray-700 mt-1">No other open run from this origin</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Create a second run first, then move the line onto it.</p>
                    </div>
                ) : (
                    <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto pr-1">
                        {targets.map(t => {
                            const sel = target === String(t.id);
                            return (
                                <button key={t.id} type="button" onClick={() => setTarget(String(t.id))}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${sel ? "border-[#c2410c] bg-orange-50/40" : "border-slate-100 bg-slate-50"}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[12px] font-bold text-gray-900 truncate">→ {t.destination}</p>
                                            <p className="text-[10px] font-mono text-slate-400">{t.reference}</p>
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                            {t.scheduled_run ? t.scheduled_run.replace("T", " • ") : "Unscheduled"}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600">Cancel</button>
                    <button
                        onClick={() => onMove(item.id, Number(target))}
                        disabled={target === "" || submitting}
                        className="flex-1 py-3 rounded-xl bg-[#c2410c] text-white text-[13px] font-bold disabled:opacity-40">
                        {submitting ? "Moving…" : "Move Line"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function SellerShipmentsIndex({
    transfer_id, reference, origin, destination,
    origin_location_id, destination_location_id, locations,
    distance_km, scheduled_run, cutoff_label, vehicles, manifest_items: items,
    variants, move_targets, courier, can_edit_manifest,
    agreements, schedule_options, agreed_scheduled_for,
    outstanding_parties, actionable_parties, workflow_status,
}: Props) {
    const [selectedVehicle, setSelectedVehicle] = useState(
        vehicles.find(v => v.is_primary)?.id ?? vehicles[0]?.id
    );
    const [scheduleInput, setScheduleInput] = useState(scheduled_run);

    /**
     * Quantities are the one thing still edited locally, because the seller
     * nudges them up and down before committing the manifest in one save. The
     * lines themselves live on the server: adding, removing and moving them
     * each go straight to it, so what this screen shows is what the stock
     * keeper will be picking.
     */
    const [quantities, setQuantities] = useState<Record<number, number>>(
        Object.fromEntries(items.map(i => [i.id, i.quantity]))
    );

    const [editRouteOpen, setEditRouteOpen] = useState(false);
    const [addItemsOpen,  setAddItemsOpen]  = useState(false);
    const [moveItem,      setMoveItem]      = useState<ManifestItem | null>(null);
    const [activePartyModal, setActivePartyModal] = useState<PartyKey | null>(null);
    const [busy, setBusy] = useState<null | "route" | "items" | "move" | "remove" | "agree" | "save">(null);

    const activeVehicle  = vehicles.find(v => v.id === selectedVehicle);
    const maxCbm         = activeVehicle?.max_cbm  ?? 14.5;
    const maxKg          = activeVehicle?.payload_kg ?? 4200;
    const totalCbm       = items.reduce((s, i) => s + i.cbm       * ((quantities[i.id] ?? 0) / i.quantity), 0);
    const totalKg        = items.reduce((s, i) => s + (i.weight_kg ?? 0) * ((quantities[i.id] ?? 0) / i.quantity), 0);
    const cbmPercent     = Math.min(Math.round((totalCbm / maxCbm) * 100), 100);
    const kgPercent      = Math.min(Math.round((totalKg  / maxKg)  * 100), 100);
    const totalCartons   = Object.values(quantities).reduce((a, b) => a + b, 0);

    const handleQty = (id: number, delta: number) =>
        setQuantities(p => ({ ...p, [id]: Math.max(0, (p[id] ?? 0) + delta) }));

    /** Every mutation below is a real request; the page reloads from the record. */
    const done = () => setBusy(null);

    const handleSaveRoute = (originId: number, destId: number) => {
        setBusy("route");
        router.patch(
            route("seller.shipments.route.update", transfer_id),
            { origin_location_id: originId, destination_location_id: destId },
            {
                preserveScroll: true,
                onSuccess: () => setEditRouteOpen(false),
                onFinish: done,
            },
        );
    };

    const handleAddItems = (lines: NewManifestLine[]) => {
        setBusy("items");
        router.post(
            route("seller.shipments.items.bulk", transfer_id),
            // Cast because Inertia types a visit payload as flat form data;
            // the endpoint takes a `lines` array and Inertia serialises it fine.
            { lines } as unknown as Record<string, never>,
            {
                preserveScroll: true,
                onSuccess: () => setAddItemsOpen(false),
                onFinish: done,
            },
        );
    };

    const handleRemoveItem = (variantId: number) => {
        setBusy("remove");
        router.delete(
            route("seller.shipments.items.destroy", [transfer_id, variantId]),
            { preserveScroll: true, onFinish: done },
        );
    };

    const handleMoveItem = (variantId: number, targetShipmentId: number) => {
        setBusy("move");
        router.post(
            route("seller.shipments.items.move", [transfer_id, variantId]),
            { target_shipment_id: targetShipmentId },
            {
                preserveScroll: true,
                onSuccess: () => setMoveItem(null),
                onFinish: done,
            },
        );
    };

    const handleAgree = (party: PartyKey, slot: string, stance: "accepted" | "rescheduled") => {
        setBusy("agree");
        router.post(
            route("seller.shipments.agree", transfer_id),
            { party, slot, stance },
            {
                preserveScroll: true,
                onSuccess: () => setActivePartyModal(null),
                onFinish: done,
            },
        );
    };

    const handleSaveManifest = () => {
        const vehicle = vehicles.find(v => v.id === selectedVehicle);
        setBusy("save");
        router.post(
            route("seller.shipments.manifest.save", transfer_id),
            {
                quantities,
                vehicle_name: vehicle?.name,
                vehicle_plate: vehicle?.plate,
                vehicle_max_cbm: vehicle?.max_cbm,
                scheduled_run: scheduleInput,
            },
            { onFinish: done },
        );
    };

    /** Has this party accepted, as recorded by whichever role ticked it? */
    const hasAgreed = (party: PartyKey) =>
        party === "creator"
            ? agreements.creator.status === "created" || agreements.creator.status === "accepted"
            : agreements[party].status === "accepted";

    const loadLabel = cbmPercent <= 40 ? "Under Capacity" : cbmPercent <= 75 ? "Optimal Load" : "Near Capacity";
    const loadCls   = cbmPercent <= 40 ? "bg-emerald-100 text-emerald-800" : cbmPercent <= 75 ? "bg-orange-100 text-[#c2410c]" : "bg-red-100 text-red-800";

    return (
        <>
            <Head title="Build Shipment" />

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
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{reference}</p>
                        <p className="text-[15px] font-bold text-gray-900 leading-tight">Phase 1 of 3 — Manifest</p>
                    </div>
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                    can_edit_manifest ? "bg-orange-50 text-[#c2410c] border border-orange-200/60" : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}>
                    {STAGE_LABELS[workflow_status] ?? workflow_status}
                </span>
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

                    {/* The windows actually on the table. These are the slots the
                        other three parties are choosing from, so they come from
                        the record rather than from four fixed October dates. */}
                    {schedule_options.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 mb-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-slate-700">Proposed Time Windows:</p>
                                <span className="text-[9px] text-[#c2410c] font-semibold">Multi-Party Agreement</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {schedule_options.map((slotOpt, idx) => {
                                    const isCurrent = slotOpt === scheduleInput;
                                    return (
                                        <button
                                            key={slotOpt}
                                            type="button"
                                            onClick={() => setScheduleInput(slotOpt)}
                                            className={`p-1.5 rounded-lg text-left text-[10px] font-mono active:scale-95 transition-all border ${
                                                isCurrent
                                                    ? "bg-orange-50 border-[#c2410c] text-[#c2410c]"
                                                    : "bg-white border-slate-200/80 text-slate-700 hover:border-[#c2410c] hover:text-[#c2410c]"
                                            }`}
                                        >
                                            <span className="text-[8px] font-bold uppercase text-slate-400 block">
                                                {slotOpt === agreed_scheduled_for ? "Agreed" : `Window ${idx + 1}`}
                                            </span>
                                            {slotOpt.replace("T", " • ")}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="p-2.5 rounded-xl bg-blue-50/60 flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-blue-500 shrink-0 mt-0.5">info</span>
                        <p className="text-[11px] text-slate-500 leading-snug">
                            <strong className="text-gray-700">Agreement Protocol:</strong> Picking cannot start until the
                            fleet, the origin dock and the receiving dock all accept the same window.
                        </p>
                    </div>
                </div>

                {/* ── 4-Party Inbound Agreement Gate ── */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[13px] font-bold text-gray-900">4-Party Inbound Agreement Gate</p>
                            <p className="text-[10px] text-slate-400">
                                {outstanding_parties.length === 0
                                    ? "All parties agreed"
                                    : `Awaiting ${outstanding_parties.length} of 4 — tap a party for detail`}
                            </p>
                        </div>
                        <span className="text-[10px] font-bold text-[#c2410c] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200/50">
                            {4 - outstanding_parties.length}/4 AGREED
                        </span>
                    </div>
                    {/* Each tile reflects a stance recorded by whichever role owns
                        it — delivery for fleet, the stock keepers for the two
                        docks — rather than a guess from this screen's own state. */}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                        {([
                            { key: "creator" as PartyKey,     label: "1. Creator", icon: "person" },
                            { key: "fleet" as PartyKey,       label: "2. Fleet",   icon: "local_shipping" },
                            { key: "origin" as PartyKey,      label: "3. Origin",  icon: "warehouse" },
                            { key: "destination" as PartyKey, label: "4. Dest.",   icon: "storefront" },
                        ]).map(({ key, label, icon }) => ({
                            key, label, icon,
                            sub: agreements[key].role,
                            agreed: hasAgreed(key),
                        })).map((p, idx) => {
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
                    reference={reference}
                    scheduleOptions={schedule_options}
                    selectedSchedule={agreed_scheduled_for ?? schedule_options[0]}
                    agreedSlot={agreed_scheduled_for}
                    outstandingParties={outstanding_parties}
                    actionableParties={actionable_parties}
                    submitting={busy === "agree"}
                    onAgree={handleAgree}
                    agreements={agreements}
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

                    {/*
                      Driver assignment is the delivery role's to make, not the
                      seller's: a run goes on the courier board and the driver who
                      accepts a window takes it. This used to be a picker over two
                      invented drivers that wrote to nothing.
                    */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 block">Driver</label>
                        {courier ? (
                            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-white text-[18px]">person</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-bold text-gray-900 truncate">{courier.name}</p>
                                    <p className="text-[10px] font-mono text-slate-500">{courier.phone || "No number on file"}</p>
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 shrink-0">
                                    {agreements.fleet.status_label}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-slate-500 text-[18px]">person_search</span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[12px] font-bold text-gray-700">On the courier board</p>
                                    <p className="text-[10px] text-slate-400">The driver who accepts a window takes the run.</p>
                                </div>
                            </div>
                        )}
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
                        <button onClick={() => setAddItemsOpen(true)} disabled={!can_edit_manifest}
                            title={can_edit_manifest ? undefined : "The manifest is locked once picking has started"}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#c2410c] text-white text-[12px] font-bold active:scale-95 transition-transform shrink-0 disabled:opacity-40">
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
                        <button onClick={() => setQuantities(Object.fromEntries(items.map(i => [i.id, i.quantity])))}
                            className="flex items-center gap-1 text-red-400 text-[11px] font-medium">
                            <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                            Reset
                        </button>
                    </div>

                    <div className="space-y-2.5">
                        {items.length === 0 && (
                            <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100">
                                <span className="material-symbols-outlined text-slate-300 text-[32px]">inventory_2</span>
                                <p className="text-[13px] font-bold text-gray-900 mt-1">Manifest is empty</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Add at least one line before this run can be scheduled.</p>
                            </div>
                        )}
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
                                                {/*
                                                  A run has one destination, so a line
                                                  cannot be sent somewhere else on it.
                                                  Splitting a load across two facilities
                                                  means two runs — the swap button below
                                                  moves a line onto the other one.
                                                */}
                                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-0.5">
                                                    <span className="material-symbols-outlined text-[10px]">storefront</span>
                                                    To: {destination.name}
                                                </span>
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
                                        <button onClick={() => setMoveItem(item)} disabled={!can_edit_manifest}
                                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-slate-100 disabled:opacity-30" title="Move line to another run">
                                            <span className="material-symbols-outlined text-[13px] text-slate-400">swap_horiz</span>
                                        </button>
                                        <button onClick={() => handleRemoveItem(item.id)}
                                            disabled={!can_edit_manifest || busy === "remove"}
                                            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-50 disabled:opacity-30" title="Remove line">
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
                            onClick={handleSaveManifest}
                            disabled={busy === "save"}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#c2410c] text-white font-bold text-[12px] shadow-md shrink-0 active:scale-95 transition-transform disabled:opacity-50">
                            {busy === "save" ? "Saving…" : "Review"}
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Bottom Sheets ── */}
            <EditRouteSheet
                open={editRouteOpen}
                origins={locations?.origins ?? []}
                destinations={locations?.destinations ?? []}
                originId={origin_location_id ?? 0}
                destId={destination_location_id ?? 0}
                submitting={busy === "route"}
                onClose={() => setEditRouteOpen(false)}
                onSave={handleSaveRoute}
            />
            <AddItemsSheet
                open={addItemsOpen}
                variants={variants}
                existingIds={items.map(i => i.id)}
                submitting={busy === "items"}
                onClose={() => setAddItemsOpen(false)}
                onAdd={handleAddItems}
            />
            <MoveItemSheet
                open={!!moveItem}
                item={moveItem}
                targets={move_targets}
                submitting={busy === "move"}
                onClose={() => setMoveItem(null)}
                onMove={handleMoveItem}
            />
        </>
    );
}

SellerShipmentsIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;