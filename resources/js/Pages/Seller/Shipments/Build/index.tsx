import React, { useMemo, useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import PartyDetailModal from "@/Components/Seller/PartyDetailModal";
import RefillSuggestionsPanel from "@/Components/Seller/Shipments/RefillSuggestionsPanel";
import HandoffPanel from "@/Components/Shipment/HandoffPanel";
import type { ShipmentHandoff } from "@/types/shipment";
import type { ReplenishmentPanel } from "@/types/refills";
import type {
    CourierInfo,
    CourierOption,
    FleetChoice,
    FleetVehicle,
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
    /** Refill requests this run could take (RefillBoard::manifestPanel). */
    replenishment?: ReplenishmentPanel;
    /** The car and the drivers the run is offered to. */
    fleet?: FleetChoice;
    /** Cars from the admin Fleet list. */
    vehicle_options?: FleetVehicle[];
    /** The pick → prepare → driver → receiver process once scheduled. */
    handoff?: ShipmentHandoff;
    /** Drivers the run can be offered to. */
    courier_options?: CourierOption[];
}

/** The four steps of building a run, each its own screen. */
type BuildStep = "corridor" | "fleet" | "load" | "manifest";

const BUILD_STEPS: { key: BuildStep; label: string; icon: string }[] = [
    { key: "corridor", label: "Corridor", icon: "route" },
    { key: "fleet",    label: "Fleet",    icon: "local_shipping" },
    { key: "load",     label: "Load",     icon: "view_in_ar" },
    { key: "manifest", label: "Manifest", icon: "inventory_2" },
];

/** The step a seller was on survives the page reloading after each save. */
const stepKey = (id: number) => `shipment-build-step-${id}`;

function readStep(id: number): BuildStep {
    try {
        const saved = window.sessionStorage.getItem(stepKey(id));
        return BUILD_STEPS.some(s => s.key === saved) ? (saved as BuildStep) : "corridor";
    } catch {
        return "corridor";
    }
}

function writeStep(id: number, step: BuildStep): void {
    try {
        window.sessionStorage.setItem(stepKey(id), step);
    } catch {
        // Storage blocked: the step just resets on reload.
    }
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
        status === "oos"     ? "bg-error-container text-on-error-container" :
        status === "sold"    ? "bg-info-container text-on-info-container" :
        status === "low"     ? "bg-warning-container text-on-warning-container" :
                               "bg-surface-container text-on-surface-variant";
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide shrink-0 ${cls}`}>{label}</span>;
}

function ItemIcon({ icon }: { icon: string }) {
    const iconName = icon === "report" ? "error" : icon === "warning" ? "warning" : icon === "sell" ? "sell" : "inventory_2";
    const colorCls = icon === "report" ? "text-error" : icon === "warning" ? "text-warning" : icon === "sell" ? "text-info" : "text-on-surface-variant";
    return <span className={`material-symbols-outlined text-[18px] ${colorCls}`}>{iconName}</span>;
}

function CbmGauge({ percent }: { percent: number }) {
    const r    = 15.9155;
    const circ = 2 * Math.PI * r;
    const dash = (Math.min(percent, 100) / 100) * circ;
    const tone = percent > 85 ? "text-error" : percent > 60 ? "text-warning" : "text-primary";
    return (
        <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="currentColor" strokeWidth="3.8" className="text-on-surface/10" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="currentColor" strokeWidth="3.8" className={tone}
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.4s ease" }} />
            </svg>
            <div style={{ position: "absolute", textAlign: "center" }}>
                <div className={tone} style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{percent}%</div>
                <div className="text-outline" style={{ fontSize: 9, textTransform: "uppercase", marginTop: 2 }}>Cubed</div>
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
            <div className="w-full max-w-[425px] bg-surface-container-lowest rounded-t-3xl p-5 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-surface-container-high rounded-full mx-auto mb-4" />
                <h3 className="text-[16px] font-bold text-on-surface mb-4">Edit Route</h3>
                <div className="space-y-3 mb-5">
                    <div>
                        <label className="text-[10px] font-bold text-outline uppercase tracking-wide mb-1 block">Origin Facility</label>
                        <select value={originVal} onChange={e => setOriginVal(e.target.value)}
                            className="w-full border border-outline-variant rounded-xl px-3 py-2.5 text-[13px] font-semibold text-on-surface bg-surface-container-low focus:outline-none">
                            {origins.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-outline uppercase tracking-wide mb-1 block">Destination Facility</label>
                        <select value={destVal} onChange={e => setDestVal(e.target.value)}
                            className="w-full border border-outline-variant rounded-xl px-3 py-2.5 text-[13px] font-semibold text-on-surface bg-surface-container-low focus:outline-none">
                            {destinations.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>
                {/* Rerouting withdraws the other parties' consent, so say so before
                    the seller commits rather than after. */}
                <div className="p-2.5 rounded-xl bg-warning-container/60 border border-warning/20 flex items-start gap-1.5 mb-4">
                    <span className="material-symbols-outlined text-[15px] text-warning shrink-0 mt-0.5">warning</span>
                    <p className="text-[11px] text-on-warning-container leading-snug">
                        Changing either end asks the driver, origin dock and receiving dock to agree again.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-outline-variant text-[13px] font-semibold text-on-surface-variant">Cancel</button>
                    <button onClick={handleSave} disabled={sameEnds || submitting}
                        className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-[13px] font-bold disabled:opacity-40">
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
            <div className="w-full max-w-[425px] bg-surface-container-lowest rounded-t-3xl p-5 pb-10 max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-surface-container-high rounded-full mx-auto mb-4 shrink-0" />
                <h3 className="text-[16px] font-bold text-on-surface mb-1 shrink-0">Add Items to Manifest</h3>
                <p className="text-[11px] text-outline mb-3 shrink-0">Set a packaging unit and carton count for each SKU</p>

                <div className="relative mb-3 shrink-0">
                    <span className="material-symbols-outlined text-[16px] text-outline absolute left-3 top-1/2 -translate-y-1/2">search</span>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search product or SKU"
                        className="w-full border border-outline-variant rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-on-surface bg-surface-container-low focus:outline-none focus:border-primary"
                    />
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                    {available.length === 0
                        ? (
                            <p className="text-[13px] text-outline text-center py-6">
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
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${isSel ? "border-primary bg-primary-container/25" : "border-outline-variant/60 bg-surface-container-low"}`}>
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSel ? "bg-primary border-primary" : "border-outline/50"}`}>
                                            {isSel && <span className="material-symbols-outlined text-on-primary text-[12px]">check</span>}
                                        </div>
                                        <ItemIcon icon="inventory" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-bold text-on-surface truncate">{variant.label}</p>
                                            <p className="text-[10px] font-mono text-outline">{variant.sku ?? "No SKU"}</p>
                                        </div>
                                    </div>
                                    {isSel && (
                                        <div className="mt-2.5 pt-2 border-t border-dashed border-outline-variant space-y-2" onClick={e => e.stopPropagation()}>
                                            <div>
                                                <p className="text-[10px] font-semibold text-on-surface-variant mb-1">Packaging Unit:</p>
                                                <div className="flex gap-1.5">
                                                    {PACK_UNITS.map(u => (
                                                        <button key={u}
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setLine(variant.id, { unit: u }); }}
                                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${line.unit === u ? "bg-primary text-on-primary" : "bg-surface-container-lowest border border-outline-variant text-on-surface-variant"}`}>
                                                            {u}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-on-surface-variant mb-1">Quantity:</p>
                                                <div className="flex items-center gap-1.5">
                                                    <button type="button"
                                                        onClick={e => { e.stopPropagation(); setLine(variant.id, { quantity: Math.max(1, line.quantity - 1) }); }}
                                                        className="w-7 h-7 rounded-lg border border-outline-variant bg-surface-container-lowest flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">remove</span>
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={line.quantity}
                                                        onClick={e => e.stopPropagation()}
                                                        onChange={e => setLine(variant.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                                        className="w-16 text-center border border-outline-variant rounded-lg py-1 text-[12px] font-bold font-mono text-on-surface bg-surface-container-lowest focus:outline-none"
                                                    />
                                                    <button type="button"
                                                        onClick={e => { e.stopPropagation(); setLine(variant.id, { quantity: line.quantity + 1 }); }}
                                                        className="w-7 h-7 rounded-lg border border-outline-variant bg-surface-container-lowest flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">add</span>
                                                    </button>
                                                    <span className="text-[10px] text-outline ml-1">{line.unit}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    }
                </div>
                <div className="flex gap-2 mt-4 shrink-0 pt-4 border-t border-outline-variant/60 pb-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-outline-variant text-[13px] font-semibold text-on-surface-variant">Cancel</button>
                    <button onClick={handleAdd} disabled={count === 0 || submitting}
                        className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-[13px] font-bold disabled:opacity-40">
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
            <div className="w-full max-w-[425px] bg-surface-container-lowest rounded-t-3xl p-5 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-surface-container-high rounded-full mx-auto mb-4" />
                <h3 className="text-[16px] font-bold text-on-surface mb-1">Move Item</h3>
                <p className="text-[12px] text-on-surface-variant mb-4">
                    Move <strong className="text-on-surface">{item.name}</strong> onto another run leaving this origin.
                </p>

                {/* Only open runs from the same dock can take the line, so the
                    server decides what is on offer here. */}
                {targets.length === 0 ? (
                    <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 text-center mb-4">
                        <span className="material-symbols-outlined text-outline text-[28px]">route</span>
                        <p className="text-[12px] font-bold text-on-surface-variant mt-1">No other open run from this origin</p>
                        <p className="text-[11px] text-outline mt-0.5">Create a second run first, then move the line onto it.</p>
                    </div>
                ) : (
                    <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto pr-1">
                        {targets.map(t => {
                            const sel = target === String(t.id);
                            return (
                                <button key={t.id} type="button" onClick={() => setTarget(String(t.id))}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${sel ? "border-primary bg-primary-container/25" : "border-outline-variant/60 bg-surface-container-low"}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[12px] font-bold text-on-surface truncate">→ {t.destination}</p>
                                            <p className="text-[10px] font-mono text-outline">{t.reference}</p>
                                        </div>
                                        <span className="text-[10px] font-mono text-on-surface-variant shrink-0">
                                            {t.scheduled_run ? t.scheduled_run.replace("T", " • ") : "Unscheduled"}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-outline-variant text-[13px] font-semibold text-on-surface-variant">Cancel</button>
                    <button
                        onClick={() => onMove(item.id, Number(target))}
                        disabled={target === "" || submitting}
                        className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-[13px] font-bold disabled:opacity-40">
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
    replenishment = { suggestions: [], can_add: false, manifest_open: false },
    fleet = { vehicle_id: null, eligible_courier_ids: [], eligible_couriers: [] },
    vehicle_options = [], courier_options = [], handoff,
    agreements, schedule_options, agreed_scheduled_for,
    outstanding_parties, actionable_parties, workflow_status,
}: Props) {
    const [step, setStepState] = useState<BuildStep>(() => readStep(transfer_id));
    const setStep = (next: BuildStep) => {
        setStepState(next);
        writeStep(transfer_id, next);
    };
    const stepIndex = BUILD_STEPS.findIndex(s => s.key === step);

    // The car from the Fleet list, and the drivers the run is offered to.
    const [vehicleId, setVehicleId] = useState<number | null>(fleet.vehicle_id);
    const [courierIds, setCourierIds] = useState<number[]>(fleet.eligible_courier_ids);
    const toggleCourier = (id: number) =>
        setCourierIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
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

    // The picked car's capacity; before one is picked, whatever the run carries.
    const activeVehicle  = vehicle_options.find(v => v.id === vehicleId) ?? null;
    const maxCbm         = activeVehicle?.max_cbm || vehicles[0]?.max_cbm || 14.5;
    const maxKg          = activeVehicle?.payload_kg || vehicles[0]?.payload_kg || 4200;
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

    /**
     * Save everything the creator decides: times, car, drivers and quantities.
     * There is no review step after this — once the driver and both docks
     * accept the same window the run is scheduled on its own.
     */
    const handleSaveManifest = () => {
        setBusy("save");
        router.post(
            route("seller.shipments.manifest.save", transfer_id),
            {
                quantities,
                scheduled_run: scheduleInput,
                vehicle_id: vehicleId,
                courier_ids: courierIds,
            },
            { preserveScroll: true, onFinish: done },
        );
    };

    /** Has this party accepted, as recorded by whichever role ticked it? */
    const hasAgreed = (party: PartyKey) =>
        party === "creator"
            ? agreements.creator.status === "created" || agreements.creator.status === "accepted"
            : agreements[party].status === "accepted";

    const loadLabel = cbmPercent <= 40 ? "Under Capacity" : cbmPercent <= 75 ? "Optimal Load" : "Near Capacity";
    const loadCls   = cbmPercent <= 40 ? "bg-success-container text-on-success-container" : cbmPercent <= 75 ? "bg-primary-container text-on-primary-container" : "bg-error-container text-on-error-container";

    return (
        <>
            <Head title="Build Shipment" />

            {/* ── Sticky Top Context Strip ── */}
            <div className="px-4 pt-3 pb-2.5 flex items-center justify-between bg-surface-container-lowest border-b border-outline-variant/60 sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            if (window.history.length > 1) {
                                window.history.back();
                            } else {
                                router.visit(route("seller.shipments.index"));
                            }
                        }}
                        className="w-8 h-8 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/80 flex items-center justify-center mr-1 active:scale-95 transition-all text-on-surface-variant"
                        aria-label="Back"
                    >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    </button>
                    <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-outline uppercase tracking-wider truncate">{reference}</p>
                        <p className="text-[15px] font-bold text-on-surface leading-tight">Build shipment</p>
                    </div>
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                    can_edit_manifest ? "bg-primary-container/60 text-primary border border-primary/20" : "bg-surface-container text-on-surface-variant border border-outline-variant"
                }`}>
                    {STAGE_LABELS[workflow_status] ?? workflow_status}
                </span>
            </div>

            {/* Content Container (lots of bottom padding to clear the double action bars) */}
            <div className="px-3.5 pt-3 pb-52 space-y-3">

                {/* ── Hand-off: once all four agree, everything after happens here ── */}
                {handoff && !["draft", "pending_agreement", "cancelled"].includes(workflow_status) && (
                    <HandoffPanel
                        shipmentId={transfer_id}
                        reference={reference}
                        handoff={handoff}
                        lines={items.map(i => ({
                            variant_id: i.id,
                            name: i.name,
                            sku: i.sku,
                            quantity: i.quantity,
                            picked_quantity: i.picked_quantity ?? 0,
                            unit: i.unit,
                        }))}
                        stepRoute="seller.shipments.step"
                        originName={origin.name}
                        destinationName={destination.name}
                    />
                )}

                {/* ── 4-Party Agreement Gate: centre stage ── */}
                <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant/60 shadow-md overflow-hidden">
                    <div className={`px-4 pt-4 pb-3 ${outstanding_parties.length === 0 ? "bg-success-container/40" : "bg-primary-container/30"}`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Agreement Gate</p>
                                <p className="text-[17px] font-bold text-on-surface leading-tight">
                                    {outstanding_parties.length === 0
                                        ? "Everyone agreed — scheduled"
                                        : `Waiting on ${outstanding_parties.length} of 4`}
                                </p>
                                <p className="text-[11px] text-on-surface-variant mt-0.5">
                                    {agreed_scheduled_for
                                        ? `Agreed window ${agreed_scheduled_for.replace("T", " • ")}`
                                        : "Driver, origin and destination each pick one of your windows."}
                                </p>
                            </div>
                            {/* Progress ring */}
                            <div className="relative w-14 h-14 shrink-0">
                                <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                                    <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-surface-container-high" />
                                    <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" strokeLinecap="round"
                                        className={outstanding_parties.length === 0 ? "stroke-success" : "stroke-primary"}
                                        strokeDasharray={`${((4 - outstanding_parties.length) / 4) * 97.4} 97.4`} />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-on-surface">
                                    {4 - outstanding_parties.length}/4
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Each party: its stance, and who works that end. Origin and
                        destination keepers are set per location on the admin
                        Locations page; the drivers come from the Fleet step. */}
                    <div className="divide-y divide-outline-variant/50">
                        {([
                            { key: "creator" as PartyKey,     icon: "person",         title: "Creator" },
                            { key: "fleet" as PartyKey,       icon: "local_shipping", title: "Driver" },
                            { key: "origin" as PartyKey,      icon: "warehouse",      title: "Origin dock" },
                            { key: "destination" as PartyKey, icon: "storefront",     title: "Destination dock" },
                        ]).map(({ key, icon, title }) => {
                            const a = agreements[key];
                            const agreed = hasAgreed(key);
                            const people = a.people ?? [];
                            return (
                                <button key={key} type="button" onClick={() => setActivePartyModal(key)}
                                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-container-low transition-colors">
                                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${agreed ? "bg-success text-on-success" : "bg-surface-container text-on-surface-variant"}`}>
                                        <span className="material-symbols-outlined text-[20px]">{agreed ? "check" : icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[13px] font-bold text-on-surface truncate">{title} · <span className="font-semibold text-on-surface-variant">{a.party}</span></p>
                                            <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${agreed ? "bg-success-container text-on-success-container" : "bg-warning-container text-on-warning-container"}`}>
                                                {a.status_label}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-outline truncate">{a.detail}</p>
                                        {key !== "creator" && (
                                            <p className="text-[10px] text-on-surface-variant mt-1 truncate">
                                                <span className="material-symbols-outlined text-[11px] align-[-2px] mr-0.5">group</span>
                                                {people.length > 0
                                                    ? people.map(p => `${p.name} (${p.as})`).join(", ")
                                                    : key === "fleet"
                                                        ? "Open to every driver — pick drivers on the Fleet step"
                                                        : "No one assigned — any stock keeper for this store can act. Assign on Inventory → Locations."}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

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

                {/* ── Build steps: each part of the run is its own screen ── */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm p-1.5 grid grid-cols-4 gap-1">
                    {BUILD_STEPS.map((st, i) => {
                        const active = st.key === step;
                        return (
                            <button
                                key={st.key}
                                type="button"
                                onClick={() => setStep(st.key)}
                                className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${
                                    active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">{st.icon}</span>
                                <span className="text-[10px] font-bold leading-none">{i + 1}. {st.label}</span>
                            </button>
                        );
                    })}
                </div>

                {step === "corridor" && (
                    <>
                    {/* ── Route Matrix Card ── */}
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Replenishment Corridor</p>
                            <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container text-[10px] font-bold">WH → Retail</span>
                                <button onClick={() => setEditRouteOpen(true)}
                                    className="w-7 h-7 rounded-lg bg-surface-container-low border border-outline-variant/60 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">edit</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 bg-surface-container-low rounded-xl p-3 mb-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-bold text-outline uppercase flex items-center gap-1 mb-0.5">
                                    <span className="material-symbols-outlined text-[11px]">warehouse</span> Origin
                                </p>
                                <p className="text-[13px] font-bold text-on-surface truncate">{origin.name}</p>
                                <p className="text-[10px] text-outline truncate">{origin.detail}</p>
                            </div>
                            <div className="flex flex-col items-center shrink-0">
                                <span className="material-symbols-outlined text-primary text-[18px]">arrow_forward</span>
                                <span className="text-[9px] text-outline">{distance_km} km</span>
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                                <p className="text-[9px] font-bold text-outline uppercase flex items-center justify-end gap-1 mb-0.5">
                                    Target <span className="material-symbols-outlined text-[11px]">storefront</span>
                                </p>
                                <p className="text-[13px] font-bold text-on-surface truncate">{destination.name}</p>
                                <p className="text-[10px] text-outline truncate">{destination.detail}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-surface-container-low rounded-xl p-3 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-on-primary text-[16px]">schedule</span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[9px] text-outline mb-0.5">Scheduled Time</p>
                                    <input type="datetime-local" value={scheduleInput}
                                        onChange={e => setScheduleInput(e.target.value)}
                                        className="text-[13px] font-bold text-on-surface bg-transparent border-none outline-none w-full" />
                                </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container text-[10px] font-bold shrink-0">{cutoff_label}</span>
                        </div>

                        {/* The windows actually on the table. These are the slots the
                            other three parties are choosing from, so they come from
                            the record rather than from four fixed October dates. */}
                        {schedule_options.length > 0 && (
                            <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60 mb-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-on-surface-variant">Proposed Time Windows:</p>
                                    <span className="text-[9px] text-primary font-semibold">Multi-Party Agreement</span>
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
                                                        ? "bg-primary-container/60 border-primary text-primary"
                                                        : "bg-surface-container-lowest border-outline-variant/80 text-on-surface-variant hover:border-primary hover:text-primary"
                                                }`}
                                            >
                                                <span className="text-[8px] font-bold uppercase text-outline block">
                                                    {slotOpt === agreed_scheduled_for ? "Agreed" : `Window ${idx + 1}`}
                                                </span>
                                                {slotOpt.replace("T", " • ")}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="p-2.5 rounded-xl bg-info-container/35 flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-info shrink-0 mt-0.5">info</span>
                            <p className="text-[11px] text-on-surface-variant leading-snug">
                                <strong className="text-on-surface-variant">Agreement Protocol:</strong> Once the driver, the origin dock
                                and the receiving dock accept the same window, the run is scheduled — there is no review step.
                                The origin hands the load to the driver at that time.
                            </p>
                        </div>
                    </div>



                    </>
                )}

                {step === "fleet" && (
                    <>
                    {/* ── Dedicated Fleet: the car, and the drivers it is offered to ── */}
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-primary text-[18px]">local_shipping</span>
                                <p className="text-[13px] font-bold text-on-surface">Dedicated Fleet Carrier</p>
                            </div>
                            <span className="text-[10px] font-semibold text-outline">{vehicle_options.length} in fleet</span>
                        </div>

                        <div className="space-y-2 mb-3">
                            {vehicle_options.length === 0 && (
                                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-[11px] text-outline">
                                    No cars in the fleet yet. An admin adds them under Inventory → Fleet.
                                </div>
                            )}
                            {vehicle_options.map(v => {
                                const sel = vehicleId === v.id;
                                return (
                                    <button key={v.id} type="button" disabled={!can_edit_manifest}
                                        onClick={() => setVehicleId(sel ? null : v.id)}
                                        className={`relative w-full text-left p-3 rounded-xl border-2 transition-all overflow-hidden disabled:cursor-not-allowed ${sel ? "border-primary bg-primary-container/20" : "border-outline-variant/60 bg-surface-container-low"}`}>
                                        {sel && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sel ? "bg-primary" : "bg-surface-container-high"}`}>
                                                    <span className={`material-symbols-outlined text-[20px] ${sel ? "text-on-primary" : "text-on-surface-variant"}`}>local_shipping</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-bold text-on-surface truncate">{v.name}</p>
                                                    <p className="text-[10px] font-mono text-outline">Plate: {v.plate}</p>
                                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                        <span className="px-1.5 py-0.5 rounded border border-outline-variant text-[9px] text-on-surface-variant">{v.max_cbm} CBM</span>
                                                        {v.payload_kg > 0 && (
                                                            <span className="px-1.5 py-0.5 rounded border border-outline-variant text-[9px] text-on-surface-variant">{v.payload_kg.toLocaleString()} kg</span>
                                                        )}
                                                        {v.status !== "active" && (
                                                            <span className="px-1.5 py-0.5 rounded border border-outline-variant text-[9px] text-outline">Retired</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${sel ? "bg-primary" : "bg-surface-container-high"}`}>
                                                <span className={`material-symbols-outlined text-[13px] ${sel ? "text-on-primary" : "text-outline"}`}>
                                                    {sel ? "check" : "add"}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* The drivers this run is offered to. Only they see it in
                            Delivery and may agree to a window; the first to accept
                            takes the run. None picked offers it to every driver. */}
                        <div className="mt-4 pt-3 border-t border-outline-variant/60">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-bold text-outline uppercase tracking-wide">Drivers offered</label>
                                <span className="text-[10px] text-outline">
                                    {courierIds.length === 0 ? "Open to every driver" : `${courierIds.length} picked`}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {courier_options.map(d => {
                                    const on = courierIds.includes(d.id);
                                    return (
                                        <button key={d.id} type="button" disabled={!can_edit_manifest}
                                            onClick={() => toggleCourier(d.id)}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                                                on ? "bg-primary text-on-primary border-primary" : "bg-surface-container-low text-on-surface-variant border-outline-variant"
                                            }`}>
                                            <span className="material-symbols-outlined text-[13px]">{on ? "check" : "person"}</span>
                                            {d.name}
                                        </button>
                                    );
                                })}
                                {courier_options.length === 0 && (
                                    <p className="text-[11px] text-outline">No delivery drivers on the system yet.</p>
                                )}
                            </div>

                            <div className="mt-3">
                                {courier ? (
                                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-success-container/35 border border-success/20">
                                        <div className="w-9 h-9 rounded-xl bg-success flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-on-success text-[18px]">person</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] font-bold text-on-surface truncate">{courier.name}</p>
                                            <p className="text-[10px] font-mono text-on-surface-variant">{courier.phone || "No number on file"}</p>
                                        </div>
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-success shrink-0">
                                            {agreements.fleet.status_label}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low border border-outline-variant/60">
                                        <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">person_search</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[12px] font-bold text-on-surface-variant">Waiting for a driver</p>
                                            <p className="text-[10px] text-outline">The first offered driver to accept a window takes the run.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    </>
                )}

                {step === "load" && (
                    <>
                    {/* ── Volumetric Load Telemetry ── */}
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-primary text-[18px]">view_in_ar</span>
                                <p className="text-[13px] font-bold text-on-surface">Volumetric Load Telemetry</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${loadCls}`}>{loadLabel} ({cbmPercent}%)</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <CbmGauge percent={cbmPercent} />
                            <div className="flex-1 min-w-0 space-y-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] font-semibold text-on-surface-variant">Volume</span>
                                        <span className="text-[11px] font-bold font-mono text-on-surface">{totalCbm.toFixed(1)} / {maxCbm} m³</span>
                                    </div>
                                    <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${cbmPercent > 85 ? "bg-error" : "bg-primary"}`}
                                            style={{ width: `${cbmPercent}%` }} />
                                    </div>
                                    <p className="text-[10px] font-bold text-primary mt-0.5">{(maxCbm - totalCbm).toFixed(1)} CBM Remaining</p>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] font-semibold text-on-surface-variant">Mass</span>
                                        <span className="text-[11px] font-bold font-mono text-on-surface">{Math.round(totalKg).toLocaleString()} / {maxKg.toLocaleString()} kg</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${kgPercent > 90 ? "bg-error" : "bg-outline"}`}
                                            style={{ width: `${kgPercent}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-outline-variant/60 grid grid-cols-3 text-center gap-2">
                            {[
                                { label: "SKUs",      value: items.length },
                                { label: "Cartons",   value: totalCartons },
                                { label: "Pallet Eq", value: (totalCbm / 2.07).toFixed(1) },
                            ].map(s => (
                                <div key={s.label}>
                                    <p className="text-[9px] font-bold text-outline uppercase tracking-wide">{s.label}</p>
                                    <p className="text-[17px] font-bold text-on-surface">{s.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>


                    </>
                )}

                {step === "manifest" && (
                    <>
                    {/* ── Requested refills: picked onto the manifest below ── */}
                    <RefillSuggestionsPanel shipmentId={transfer_id} panel={replenishment} />

                    {/* ── Replenishment Manifest ── */}
                    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-[13px] font-bold text-on-surface">Replenishment Manifest</p>
                                <p className="text-[10px] text-outline">Calculated from inventory velocity</p>
                            </div>
                            <button onClick={() => setAddItemsOpen(true)} disabled={!can_edit_manifest}
                                title={can_edit_manifest ? undefined : "The manifest is locked once picking has started"}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-[12px] font-bold active:scale-95 transition-transform shrink-0 disabled:opacity-40">
                                <span className="material-symbols-outlined text-[14px]">add</span>
                                Add Items
                            </button>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1">
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-error/30 text-on-error-container text-[11px] font-semibold bg-error-container/60">
                                    <span className="material-symbols-outlined text-[13px]">priority_high</span>
                                    Priority: OOS First
                                </div>
                                <button onClick={() => alert("OOS (Out of Stock) items are given highest priority for replenishment runs to prevent lost sales.")} 
                                    className="w-6 h-6 rounded-full flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors">
                                    <span className="material-symbols-outlined text-[13px]">info</span>
                                </button>
                            </div>
                            <button onClick={() => setQuantities(Object.fromEntries(items.map(i => [i.id, i.quantity])))}
                                className="flex items-center gap-1 text-error text-[11px] font-medium">
                                <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                                Reset
                            </button>
                        </div>

                        <div className="space-y-2.5">
                            {items.length === 0 && (
                                <div className="py-8 text-center bg-surface-container-low rounded-xl border border-outline-variant/60">
                                    <span className="material-symbols-outlined text-outline text-[32px]">inventory_2</span>
                                    <p className="text-[13px] font-bold text-on-surface mt-1">Manifest is empty</p>
                                    <p className="text-[11px] text-outline mt-0.5">Add at least one line before this run can be scheduled.</p>
                                </div>
                            )}
                            {items.map(item => (
                                <div key={item.id} className="p-3 rounded-xl border border-outline-variant/60 bg-surface-container-low/50">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <div className={`w-9 h-9 mt-0.5 rounded-xl flex items-center justify-center shrink-0 ${item.status === "oos" ? "bg-error-container" : item.status === "low" ? "bg-warning-container" : item.status === "sold" ? "bg-info-container" : "bg-surface-container"}`}>
                                                <ItemIcon icon={item.icon} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-bold text-on-surface truncate">{item.name}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                    <span className="text-[10px] font-mono text-outline">{item.sku}</span>
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
                                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-info-container/60 text-on-info-container border-info/30 flex items-center gap-0.5">
                                                        <span className="material-symbols-outlined text-[10px]">storefront</span>
                                                        To: {destination.name}
                                                    </span>
                                                </div>
                                                {/* Who added it / reason row */}
                                                {item.added_by && (
                                                    <div className="flex items-center gap-1 bg-surface-container/80 px-2 py-1 rounded mt-1.5 w-fit border border-outline-variant/50">
                                                        <span className={`material-symbols-outlined text-[11px] ${item.added_by.type === 'auto' ? 'text-info' : 'text-success'}`}>
                                                            {item.added_by.type === 'auto' ? 'smart_toy' : 'person'}
                                                        </span>
                                                        <span className="text-[9px] text-on-surface-variant font-medium">
                                                            {item.added_by.type === 'auto' ? 'Auto-added:' : `Added by ${item.added_by.name}:`} <span className="text-on-surface-variant">{item.added_by.reason}</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[13px] font-bold text-primary">{quantities[item.id]} {item.unit}</p>
                                            <p className="text-[10px] font-mono text-outline">
                                                {(item.cbm * (quantities[item.id] ?? 0) / item.quantity).toFixed(1)} CBM
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-surface-container-lowest rounded-lg px-2.5 py-1.5 border border-outline-variant/60 mt-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="material-symbols-outlined text-[13px] text-outline shrink-0">warehouse</span>
                                            <span className="text-[11px] text-on-surface-variant truncate">{item.location}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => setMoveItem(item)} disabled={!can_edit_manifest}
                                                className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-surface-container disabled:opacity-30" title="Move line to another run">
                                                <span className="material-symbols-outlined text-[13px] text-outline">swap_horiz</span>
                                            </button>
                                            <button onClick={() => handleRemoveItem(item.id)}
                                                disabled={!can_edit_manifest || busy === "remove"}
                                                className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-error-container/60 disabled:opacity-30" title="Remove line">
                                                <span className="material-symbols-outlined text-[13px] text-error">delete_outline</span>
                                            </button>
                                            <button onClick={() => handleQty(item.id, -1)}
                                                className="w-6 h-6 rounded-lg border border-outline-variant bg-surface-container-lowest flex items-center justify-center active:bg-surface-container">
                                                <span className="material-symbols-outlined text-[13px] text-on-surface-variant">remove</span>
                                            </button>
                                            <span className="text-[13px] font-bold font-mono text-on-surface min-w-[22px] text-center">
                                                {quantities[item.id]}
                                            </span>
                                            <button onClick={() => handleQty(item.id, 1)}
                                                className="w-6 h-6 rounded-lg border border-outline-variant bg-surface-container-lowest flex items-center justify-center active:bg-surface-container">
                                                <span className="material-symbols-outlined text-[13px] text-on-surface-variant">add</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    </>
                )}

            </div>

            {/* ── Fixed Bottom Actions Layer (Positioned ABOVE the SellerLayout Bottom Nav) ── */}
            <div className="fixed left-0 right-0 z-40 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/95 to-transparent pt-8 pb-3 px-4 pointer-events-none" style={{ bottom: "calc(85px + env(safe-area-inset-bottom, 0px))" }}>
                <div className="max-w-[425px] mx-auto flex items-center justify-between gap-3 pointer-events-auto">
                    <div className="flex-1 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-xl px-3 py-2 flex items-center justify-between gap-2 min-w-0 pointer-events-auto">
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-1 truncate">
                                <span className="text-[14px] font-bold text-primary">{totalCbm.toFixed(1)} CBM</span>
                                <span className="w-1 h-1 rounded-full bg-surface-container-highest inline-block shrink-0" />
                                <span className="text-[13px] font-bold text-on-surface">{items.length} SKUs</span>
                            </div>
                            <p className="text-[10px] text-outline truncate">{Math.round(totalKg).toLocaleString()} kg • {activeVehicle?.name ?? "No vehicle"}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {stepIndex < BUILD_STEPS.length - 1 && (
                                <button
                                    type="button"
                                    onClick={() => setStep(BUILD_STEPS[stepIndex + 1].key)}
                                    className="w-9 h-9 rounded-xl border border-outline-variant bg-surface-container-low flex items-center justify-center active:scale-95 transition-transform"
                                    aria-label="Next step"
                                >
                                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
                                </button>
                            )}
                            <button
                                onClick={handleSaveManifest}
                                disabled={busy === "save" || !can_edit_manifest}
                                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-on-primary font-bold text-[12px] shadow-md active:scale-95 transition-transform disabled:opacity-50">
                                <span className="material-symbols-outlined text-[14px]">save</span>
                                {busy === "save" ? "Saving…" : "Save"}
                            </button>
                        </div>
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