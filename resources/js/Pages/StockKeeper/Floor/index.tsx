import { Head, Link, router, useForm, usePage } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import type { FloorAreaRow, FloorPlanData, LevelStatus, StockKeeperFloorProps } from "@/types/stockkeeper";

/**
 * A hub's floor plan, to scale: the floor in metres (e.g. 10 × 30), areas drawn
 * on it, and which items sit in each area, so a keeper can walk to an item.
 * The location's CBM capacity is set on Levels; each area shows the volume of
 * the items placed in it (worked out from their stock, never typed in).
 */

const KIND_STYLE: Record<string, { fill: string; label: string }> = {
    storage: { fill: "bg-primary/15 border-primary/60", label: "Storage" },
    pallet: { fill: "bg-info/15 border-info/60", label: "Pallets" },
    rack: { fill: "bg-tertiary/15 border-tertiary/60", label: "Racking" },
    bulk: { fill: "bg-warning/15 border-warning/60", label: "Bulk" },
    cold: { fill: "bg-info/25 border-info/70", label: "Cold" },
    dock: { fill: "bg-success/15 border-success/60", label: "Dock" },
    aisle: { fill: "bg-surface-container border-outline-variant", label: "Aisle / no stock" },
};

const STATUS: Record<LevelStatus, { label: string; tone: Tone }> = {
    critical: { label: "Crit low", tone: "error" },
    empty: { label: "Empty", tone: "error" },
    low: { label: "Low", tone: "warning" },
    ok: { label: "Good", tone: "success" },
    full: { label: "Full", tone: "info" },
};

const fmt = (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

export default function FloorPage({ locations = [], plan, can_edit, focus }: StockKeeperFloorProps) {
    const [selected, setSelected] = React.useState<number | null>(null);
    const [adding, setAdding] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const query = search.trim().toLowerCase();
    // Areas holding the searched (or linked) item light up.
    const lit = React.useMemo(() => {
        if (!plan) return new Set<number>();
        return new Set(
            plan.areas
                .filter((a) => a.items.some((i) => (focus !== null && i.item_id === focus) || (query !== "" && i.name.toLowerCase().includes(query))))
                .map((a) => a.id),
        );
    }, [plan, query, focus]);

    const area = plan?.areas.find((a) => a.id === selected) ?? null;
    const pickLocation = (id: number) => router.get(route("stock_keeper.floor.index"), { location: id }, { preserveScroll: true, replace: true });

    return (
        <>
            <Head title="Floor plan" />

            <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[22px] font-extrabold tracking-tight text-on-surface sm:text-[26px]">Floor plan</h1>
                    <p className="mt-0.5 text-[13px] text-on-surface-variant sm:text-[14px]">Which area of the floor holds each item, and how much room it takes.</p>
                </div>
                {locations.length > 1 && (
                    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
                        {locations.map((l) => (
                            <button
                                key={l.id}
                                type="button"
                                onClick={() => pickLocation(l.id)}
                                className={`flex shrink-0 items-center gap-2 rounded-[999px] border px-3.5 py-2 text-[13px] font-bold ${
                                    l.id === plan?.location.id ? "border-primary bg-primary text-on-primary shadow-sm" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{l.kind === "backroom" ? "storefront" : "warehouse"}</span>
                                {l.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <FloorErrors />

            {!plan ? (
                <EmptyState icon="warehouse" title="No hub or store floor to show" description="You aren't assigned to a hub or store floor yet." framed />
            ) : !plan.floor.width || !plan.floor.length ? (
                <FloorSize plan={plan} canEdit={can_edit} />
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <section className="min-w-0">
                        {/* Floor stats */}
                        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                                { label: "Floor", value: `${fmt(plan.floor.width)} × ${fmt(plan.floor.length)} m` },
                                { label: "Floor area", value: `${fmt(plan.floor.area_m2 ?? 0)} m²` },
                                { label: "Areas", value: fmt(plan.areas.length) },
                                {
                                    label: "Volume used",
                                    value: plan.capacity.cbm ? `${fmt(plan.capacity.used_cbm, 1)} / ${fmt(plan.capacity.cbm, 1)} m³` : `${fmt(plan.capacity.used_cbm, 1)} m³`,
                                },
                            ].map((s) => (
                                <div key={s.label} className="rounded-[14px] border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-sm">
                                    <p className="text-[12px] font-bold text-on-surface-variant">{s.label}</p>
                                    <p className="truncate text-[15px] font-extrabold tabular-nums text-on-surface">{s.value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mb-3 flex items-center gap-2 rounded-[14px] border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-sm focus-within:border-primary">
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Find an item on the floor"
                                className="w-full border-0 bg-transparent p-0 text-[15px] focus:ring-0"
                            />
                            {(query !== "" || focus !== null) && (
                                <span className="shrink-0 text-[12px] font-bold text-primary">
                                    {lit.size} area{lit.size === 1 ? "" : "s"}
                                </span>
                            )}
                        </div>

                        <FloorMap plan={plan} lit={lit} selected={selected} onSelect={(id) => { setSelected(id); setAdding(false); }} />

                        {/* Legend */}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                            {plan.kinds.map((kind) => (
                                <span key={kind} className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
                                    <span className={`h-3 w-3 rounded-[4px] border ${KIND_STYLE[kind]?.fill ?? KIND_STYLE.storage.fill}`} />
                                    {KIND_STYLE[kind]?.label ?? kind}
                                </span>
                            ))}
                        </div>
                    </section>

                    {/* Side panel: the chosen area, adding one, or what is unplaced. */}
                    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
                        {can_edit && !adding && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setAdding(true); setSelected(null); }}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-primary py-2.5 text-[14px] font-bold text-on-primary shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                    Add area
                                </button>
                                <FloorSize plan={plan} canEdit={can_edit} compact />
                            </div>
                        )}

                        {adding ? (
                            <AreaForm plan={plan} onDone={() => setAdding(false)} />
                        ) : area ? (
                            <AreaPanel plan={plan} area={area} canEdit={can_edit} onClose={() => setSelected(null)} />
                        ) : (
                            <UnplacedPanel plan={plan} />
                        )}
                    </aside>
                </div>
            )}
        </>
    );
}

function FloorErrors() {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    return errors?.floor ? <p className="mb-3 rounded-[12px] bg-error-container px-3 py-2 text-[14px] text-on-error-container">{errors.floor}</p> : null;
}

/** The floor to scale, a cell per metre, areas as rectangles. */
function FloorMap({ plan, lit, selected, onSelect }: { plan: FloorPlanData; lit: Set<number>; selected: number | null; onSelect: (id: number) => void }) {
    const w = plan.floor.width ?? 1;
    const l = plan.floor.length ?? 1;

    return (
        <div className="overflow-x-auto rounded-[20px] border border-outline-variant bg-surface-container-lowest p-3 shadow-sm sm:p-4">
            <div className="mb-1 flex justify-between pl-6 text-[11px] font-bold text-on-surface-variant">
                <span>0 m</span>
                <span>{fmt(w)} m wide</span>
            </div>
            <div className="flex">
                <div className="flex w-6 shrink-0 flex-col justify-between py-0.5 text-[11px] font-bold text-on-surface-variant">
                    <span>0</span>
                    <span className="[writing-mode:vertical-rl]">{fmt(l)} m long</span>
                </div>
                <div
                    className="relative mx-auto rounded-[8px] border-2 border-on-surface/70 bg-surface-container-low"
                    style={{
                        width: `min(100%, calc(70vh * ${w / l}))`,
                        minWidth: "240px",
                        aspectRatio: `${w} / ${l}`,
                        backgroundImage:
                            "linear-gradient(to right, rgb(var(--outline-variant) / 0.55) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--outline-variant) / 0.55) 1px, transparent 1px)",
                        backgroundSize: `${100 / w}% ${100 / l}%`,
                    }}
                >
                    {plan.areas.map((a) => {
                        const on = a.id === selected;
                        const glow = lit.has(a.id);
                        return (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => onSelect(a.id)}
                                title={`${a.code}${a.name ? ` · ${a.name}` : ""}: ${a.items.length} items, ${fmt(a.cbm, 2)} m³`}
                                className={`absolute flex flex-col items-start justify-start overflow-hidden rounded-[6px] border-2 p-1 text-left transition-all ${KIND_STYLE[a.kind]?.fill ?? KIND_STYLE.storage.fill} ${
                                    on ? "z-10 ring-4 ring-primary/40" : ""
                                } ${glow ? "z-10 animate-pulse !border-primary !bg-primary/35" : ""}`}
                                style={{ left: `${(a.x / w) * 100}%`, top: `${(a.y / l) * 100}%`, width: `${(a.width / w) * 100}%`, height: `${(a.length / l) * 100}%` }}
                            >
                                <span className="text-[12px] font-extrabold leading-none text-on-surface">{a.code}</span>
                                {a.items.length > 0 && <span className="mt-0.5 text-[10px] font-bold leading-none text-on-surface-variant">{a.items.length} · {fmt(a.cbm, 1)} m³</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-on-surface-variant">Each square is 1 m × 1 m. Tap an area to see what's in it.</p>
        </div>
    );
}

function FloorSize({ plan, canEdit, compact = false }: { plan: FloorPlanData; canEdit: boolean; compact?: boolean }) {
    const [open, setOpen] = React.useState(!compact);
    const form = useForm({ width: plan.floor.width ? String(plan.floor.width) : "", length: plan.floor.length ? String(plan.floor.length) : "" });
    const save = (e: React.FormEvent) => {
        e.preventDefault();
        form.put(route("stock_keeper.floor.size", plan.location.id), { preserveScroll: true, onSuccess: () => compact && setOpen(false) });
    };

    if (compact && !open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-[12px] border border-outline-variant px-3 text-[13px] font-bold text-primary hover:bg-surface-container-low">
                <span className="material-symbols-outlined text-[18px]">straighten</span>
                Size
            </button>
        );
    }

    const body = (
        <form onSubmit={save} className="flex flex-col gap-3">
            {!compact && (
                <div>
                    <h2 className="text-[17px] font-extrabold text-on-surface">How big is {plan.location.name}'s floor?</h2>
                    <p className="text-[13px] text-on-surface-variant">In metres. You can change it later as long as every area still fits.</p>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {[
                    [10, 30],
                    [15, 15],
                    [20, 40],
                ].map(([pw, pl]) => (
                    <button
                        key={`${pw}x${pl}`}
                        type="button"
                        onClick={() => form.setData({ width: String(pw), length: String(pl) })}
                        className="rounded-[999px] border border-outline-variant px-3 py-1 text-[13px] font-bold text-on-surface-variant hover:border-primary hover:text-primary"
                    >
                        {pw} × {pl} m
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
                {(["width", "length"] as const).map((key) => (
                    <label key={key} className="block">
                        <span className="mb-1 block text-[13px] font-bold capitalize text-on-surface">{key}</span>
                        <span className="flex items-center rounded-[12px] border border-outline-variant bg-surface-container-low px-3 focus-within:border-primary">
                            <input type="number" min={1} step="0.5" inputMode="decimal" value={form.data[key]} onChange={(e) => form.setData(key, e.target.value)} className="w-full border-0 bg-transparent px-0 py-2.5 text-[16px] font-bold focus:ring-0" disabled={!canEdit} />
                            <span className="text-[13px] font-bold text-on-surface-variant">m</span>
                        </span>
                    </label>
                ))}
            </div>
            {canEdit ? (
                <div className="flex gap-2">
                    <button type="submit" disabled={form.processing} className="flex-1 rounded-[12px] bg-primary py-2.5 text-[14px] font-bold text-on-primary disabled:opacity-60">Save floor size</button>
                    {compact && <button type="button" onClick={() => setOpen(false)} className="rounded-[12px] px-3 text-[14px] font-bold text-on-surface-variant hover:bg-surface-container">Cancel</button>}
                </div>
            ) : (
                <p className="text-[13px] text-on-surface-variant">Ask a manager of this place to set its floor size.</p>
            )}
        </form>
    );

    return compact ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-on-surface/40" />
            <div className="relative w-full rounded-t-[24px] bg-surface-container-lowest p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[440px] sm:rounded-[24px] sm:p-6">{body}</div>
        </div>
    ) : (
        <section className="mx-auto max-w-[560px] rounded-[24px] border border-outline-variant bg-surface-container-lowest p-5 shadow-sm sm:p-6">{body}</section>
    );
}

function AreaForm({ plan, area, onDone }: { plan: FloorPlanData; area?: FloorAreaRow; onDone: () => void }) {
    const form = useForm({
        code: area?.code ?? "",
        name: area?.name ?? "",
        kind: area?.kind ?? "storage",
        x: area ? String(area.x) : "0",
        y: area ? String(area.y) : "0",
        width: area ? String(area.width) : "",
        length: area ? String(area.length) : "",
        notes: area?.notes ?? "",
    });
    const save = (e: React.FormEvent) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onDone };
        if (area) form.put(route("stock_keeper.floor.areas.update", [plan.location.id, area.id]), options);
        else form.post(route("stock_keeper.floor.areas.store", plan.location.id), options);
    };
    const num = (key: "x" | "y" | "width" | "length", label: string) => (
        <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-on-surface-variant">{label}</span>
            <span className="flex items-center rounded-[10px] border border-outline-variant bg-surface-container-low px-2.5 focus-within:border-primary">
                <input type="number" min={0} step="0.5" inputMode="decimal" value={form.data[key]} onChange={(e) => form.setData(key, e.target.value)} className="w-full border-0 bg-transparent px-0 py-2 text-[15px] font-bold focus:ring-0" />
                <span className="text-[12px] text-on-surface-variant">m</span>
            </span>
        </label>
    );

    return (
        <form onSubmit={save} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
            <h2 className="mb-3 text-[16px] font-extrabold text-on-surface">{area ? `Edit area ${area.code}` : "New area"}</h2>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <label className="block">
                    <span className="mb-1 block text-[12px] font-bold text-on-surface-variant">Code</span>
                    <input value={form.data.code} onChange={(e) => form.setData("code", e.target.value.toUpperCase())} placeholder="A1" maxLength={20} className="w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-2.5 py-2 font-mono text-[15px] font-bold focus:border-primary focus:ring-0" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-[12px] font-bold text-on-surface-variant">Name (optional)</span>
                    <input value={form.data.name} onChange={(e) => form.setData("name", e.target.value)} placeholder="e.g. Stationery bay" className="w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-2.5 py-2 text-[15px] focus:border-primary focus:ring-0" />
                </label>
            </div>
            <div className="mt-2">
                <span className="mb-1 block text-[12px] font-bold text-on-surface-variant">Kind</span>
                <div className="flex flex-wrap gap-1.5">
                    {plan.kinds.map((kind) => (
                        <button key={kind} type="button" onClick={() => form.setData("kind", kind)} className={`rounded-[999px] border px-2.5 py-1 text-[12px] font-bold ${form.data.kind === kind ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"}`}>
                            {KIND_STYLE[kind]?.label ?? kind}
                        </button>
                    ))}
                </div>
            </div>
            <p className="mt-3 mb-1 text-[12px] text-on-surface-variant">Where it starts, from the floor's top-left corner, and its size:</p>
            <div className="grid grid-cols-2 gap-2">
                {num("x", "Across")}
                {num("y", "Down")}
                {num("width", "Width")}
                {num("length", "Length")}
            </div>
            <div className="mt-4 flex gap-2">
                <button type="submit" disabled={form.processing} className="flex-1 rounded-[12px] bg-primary py-2.5 text-[14px] font-bold text-on-primary disabled:opacity-60">
                    {area ? "Save area" : "Add area"}
                </button>
                <button type="button" onClick={onDone} className="rounded-[12px] px-3 text-[14px] font-bold text-on-surface-variant hover:bg-surface-container">Cancel</button>
            </div>
        </form>
    );
}

function AreaPanel({ plan, area, canEdit, onClose }: { plan: FloorPlanData; area: FloorAreaRow; canEdit: boolean; onClose: () => void }) {
    const [editing, setEditing] = React.useState(false);
    const [itemId, setItemId] = React.useState("");
    const placedIds = new Set(area.items.map((i) => i.item_id));

    if (editing) return <AreaForm plan={plan} area={area} onDone={() => setEditing(false)} />;

    const place = () => {
        if (!itemId) return;
        router.post(route("stock_keeper.floor.areas.place", [plan.location.id, area.id]), { item_id: Number(itemId) }, { preserveScroll: true, onSuccess: () => setItemId("") });
    };

    return (
        <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
            <header className="flex items-start justify-between gap-2 border-b border-outline-variant/70 p-4">
                <div className="min-w-0">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">{KIND_STYLE[area.kind]?.label ?? area.kind}</p>
                    <h2 className="truncate text-[18px] font-extrabold text-on-surface">
                        Area {area.code}
                        {area.name ? ` · ${area.name}` : ""}
                    </h2>
                    <p className="text-[12px] text-on-surface-variant">
                        {fmt(area.width, 1)} × {fmt(area.length, 1)} m ({fmt(area.area_m2, 1)} m²) at {fmt(area.x, 1)}, {fmt(area.y, 1)} · {fmt(area.cbm, 2)} m³ of stock
                    </p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-[10px] p-1 text-on-surface-variant hover:bg-surface-container">
                    <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
            </header>

            {area.items.length === 0 ? (
                <p className="p-4 text-[13px] text-on-surface-variant">No items placed here yet.</p>
            ) : (
                <ul className="max-h-[44vh] divide-y divide-outline-variant/60 overflow-y-auto">
                    {area.items.map((item) => (
                        <li key={item.item_id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-container-low">
                                {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50">inventory_2</span>}
                            </div>
                            <Link href={route("stock_keeper.items.show", item.item_id)} className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-bold text-on-surface hover:underline">{item.name}</p>
                                <p className="truncate text-[12px] text-on-surface-variant">
                                    {item.display} · {fmt(item.cbm, 2)} m³{item.shared ? " (shared)" : ""}
                                </p>
                            </Link>
                            <StatusPill tone={STATUS[item.status].tone} label={STATUS[item.status].label} size="sm" />
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => router.delete(route("stock_keeper.floor.areas.unplace", [plan.location.id, area.id, item.item_id]), { preserveScroll: true })}
                                    aria-label={`Take ${item.name} out of ${area.code}`}
                                    className="rounded-[8px] p-1 text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                                >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && (
                <div className="border-t border-outline-variant/70 p-4">
                    <p className="mb-1.5 text-[13px] font-bold text-on-surface">Put an item here</p>
                    <div className="flex gap-2">
                        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="min-w-0 flex-1 rounded-[10px] border border-outline-variant bg-surface-container-low px-2.5 py-2 text-[14px] focus:border-primary focus:ring-0">
                            <option value="">Choose an item…</option>
                            {plan.items.filter((i) => !placedIds.has(i.item_id)).map((i) => (
                                <option key={i.item_id} value={i.item_id}>
                                    {i.name} ({i.display})
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={place} disabled={!itemId} className="rounded-[10px] bg-primary px-3 text-[14px] font-bold text-on-primary disabled:opacity-50">Place</button>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => setEditing(true)} className="flex flex-1 items-center justify-center gap-1 rounded-[10px] border border-outline-variant py-2 text-[13px] font-bold text-primary hover:bg-surface-container-low">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                            Edit area
                        </button>
                        <button
                            type="button"
                            onClick={() => router.delete(route("stock_keeper.floor.areas.destroy", [plan.location.id, area.id]), { preserveScroll: true, onSuccess: onClose })}
                            className="flex items-center justify-center gap-1 rounded-[10px] px-3 py-2 text-[13px] font-bold text-error hover:bg-error-container/50"
                        >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

function UnplacedPanel({ plan }: { plan: FloorPlanData }) {
    return (
        <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
            <header className="border-b border-outline-variant/70 px-4 py-3">
                <h2 className="text-[15px] font-extrabold text-on-surface">Not on the plan yet ({plan.unplaced.length})</h2>
                <p className="text-[12px] text-on-surface-variant">Items here with no area. Tap an area on the map to place them.</p>
            </header>
            {plan.unplaced.length === 0 ? (
                <p className="p-4 text-[13px] text-on-surface-variant">Every item here has an area.</p>
            ) : (
                <ul className="max-h-[50vh] divide-y divide-outline-variant/60 overflow-y-auto">
                    {plan.unplaced.map((item) => (
                        <li key={item.item_id}>
                            <Link href={route("stock_keeper.items.show", item.item_id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-bold text-on-surface">{item.name}</span>
                                    <span className="block truncate text-[12px] text-on-surface-variant">{item.display} · {fmt(item.cbm, 2)} m³</span>
                                </span>
                                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

FloorPage.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
