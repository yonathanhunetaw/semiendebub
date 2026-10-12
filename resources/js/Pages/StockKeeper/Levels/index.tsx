import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import type { LevelRow, LevelStatus, StockKeeperLevelsProps } from "@/types/stockkeeper";

/**
 * Stock levels at a hub or store floor.
 *
 * Like the seller's Store Shelf, without bins: each item is set to hold an
 * amount (full) with a low-stock and a crit-low line, in one of its own pack
 * units, e.g. full 100 Cartons, low 20, crit 5, with 50 there now. The
 * location's volume is a hand-entered CBM against what sits there.
 */

const STATUS: Record<LevelStatus, { label: string; tone: Tone; bar: string; icon: string }> = {
    critical: { label: "Crit low", tone: "error", bar: "bg-error", icon: "error" },
    empty: { label: "Empty", tone: "error", bar: "bg-error", icon: "block" },
    low: { label: "Low stock", tone: "warning", bar: "bg-warning", icon: "warning" },
    ok: { label: "Good", tone: "success", bar: "bg-success", icon: "check_circle" },
    full: { label: "Full", tone: "info", bar: "bg-info", icon: "inventory" },
};

const FILTERS: Array<{ key: "all" | LevelStatus; label: string }> = [
    { key: "all", label: "All" },
    { key: "critical", label: "Crit low" },
    { key: "low", label: "Low" },
    { key: "ok", label: "Good" },
    { key: "full", label: "Full" },
    { key: "empty", label: "Empty" },
];

const KIND_LABEL: Record<string, string> = {
    main_hub: "Main Hub",
    remote_hub: "Remote Hub",
    backroom: "Store floor",
};

const fmt = (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });
const plural = (unit: string, n: number) => (Math.abs(n) === 1 ? unit : `${unit}s`);

export default function Levels({ locations = [], board, can_edit }: StockKeeperLevelsProps): React.ReactElement {
    const [filter, setFilter] = React.useState<"all" | LevelStatus>("all");
    const [search, setSearch] = React.useState("");
    const [editing, setEditing] = React.useState<LevelRow | null>(null);

    const items = board?.items ?? [];
    const query = search.trim().toLowerCase();
    const shown = items.filter(
        (row) =>
            (filter === "all" || row.status === filter) &&
            (query === "" || row.name.toLowerCase().includes(query) || row.skus.some((sku) => sku.toLowerCase().includes(query))),
    );

    const pickLocation = (id: number) =>
        router.get(route("stock_keeper.levels.index"), { location: id }, { preserveScroll: true, replace: true });

    return (
        <>
            <Head title="Levels" />

            {/* Title + location switch */}
            <div className="mb-4 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-[22px] font-extrabold tracking-tight text-on-surface sm:text-[26px]">Stock levels</h1>
                    <p className="mt-0.5 text-[13px] text-on-surface-variant sm:text-[14px]">
                        What each item is set to hold, and when it runs low.
                    </p>
                </div>
                {locations.length > 1 && (
                    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
                        {locations.map((location) => {
                            const on = location.id === board?.location.id;
                            return (
                                <button
                                    key={location.id}
                                    type="button"
                                    onClick={() => pickLocation(location.id)}
                                    className={`flex shrink-0 items-center gap-2 rounded-[999px] border px-3.5 py-2 text-[13px] font-bold transition-colors ${
                                        on
                                            ? "border-primary bg-primary text-on-primary shadow-sm"
                                            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{location.kind === "backroom" ? "storefront" : "warehouse"}</span>
                                    {location.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {!board ? (
                <EmptyState icon="warehouse" title="No warehouse or store floor to show" description="You aren't assigned to a hub or store floor yet. Ask a manager to add you to one." framed />
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                    {/* Left: the location's volume and the status counts. Sticky on desktop. */}
                    <div className="flex flex-col gap-4 lg:sticky lg:top-6">
                        <CapacityCard board={board} canEdit={can_edit} />

                        <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-3 shadow-sm sm:p-4">
                            <p className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">Items by level</p>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-2">
                                {FILTERS.map((f) => {
                                    const n = f.key === "all" ? board.counts.items : board.counts[f.key];
                                    const on = filter === f.key;
                                    const tone = f.key === "all" ? null : STATUS[f.key];
                                    return (
                                        <button
                                            key={f.key}
                                            type="button"
                                            onClick={() => setFilter(f.key)}
                                            aria-pressed={on}
                                            className={`flex flex-col items-start rounded-[14px] border px-3 py-2 text-left transition-colors ${
                                                on ? "border-primary bg-primary-container/50" : "border-outline-variant/70 bg-surface-container-low hover:border-primary/60"
                                            }`}
                                        >
                                            <span className="flex items-center gap-1 text-[12px] font-bold text-on-surface-variant">
                                                {tone && <span className={`h-2 w-2 rounded-[999px] ${tone.bar}`} />}
                                                {f.label}
                                            </span>
                                            <span className="text-[20px] font-extrabold leading-tight tabular-nums text-on-surface">{fmt(n)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    </div>

                    {/* Right: the items. */}
                    <section className="min-w-0">
                        <div className="mb-3 flex items-center gap-2 rounded-[16px] border border-outline-variant bg-surface-container-lowest px-3 py-2.5 shadow-sm focus-within:border-primary">
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search an item or SKU"
                                className="w-full border-0 bg-transparent p-0 text-[15px] text-on-surface placeholder:text-on-surface-variant/70 focus:ring-0"
                            />
                            <span className="shrink-0 text-[12px] font-bold text-on-surface-variant">{fmt(shown.length)} shown</span>
                        </div>

                        {shown.length === 0 ? (
                            <EmptyState
                                icon="inventory_2"
                                title={items.length === 0 ? "Nothing here yet" : "No items match"}
                                description={items.length === 0 ? "Items appear once stock is received here or levels are set." : "Try another filter or search."}
                                framed
                            />
                        ) : (
                            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1">
                                {shown.map((row) => (
                                    <LevelCard key={row.item_id} row={row} canEdit={can_edit} onEdit={() => setEditing(row)} />
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}

            {editing && board && (
                <LevelSheet row={editing} locationId={board.location.id} locationName={board.location.name} onClose={() => setEditing(null)} />
            )}
        </>
    );
}

/** The location's volume: hand-entered capacity against what sits there. */
function CapacityCard({ board, canEdit }: { board: NonNullable<StockKeeperLevelsProps["board"]>; canEdit: boolean }) {
    const { capacity, location } = board;
    const [open, setOpen] = React.useState(false);
    const form = useForm<{ capacity_cbm: string }>({ capacity_cbm: capacity.cbm !== null ? String(capacity.cbm) : "" });
    const pct = capacity.percent ?? 0;
    const bar = pct >= 100 ? "bg-error" : pct >= 85 ? "bg-warning" : "bg-primary";

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        form.put(route("stock_keeper.levels.capacity", location.id), { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    return (
        <section className="overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
            <div className="bg-primary px-4 py-3 text-on-primary">
                <p className="text-[12px] font-bold uppercase tracking-wider opacity-80">{KIND_LABEL[location.kind] ?? "Location"}</p>
                <p className="truncate text-[18px] font-extrabold">{location.name}</p>
            </div>
            <div className="p-4">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-[12px] font-bold text-on-surface-variant">Volume used</p>
                        <p className="text-[24px] font-extrabold leading-tight tabular-nums text-on-surface">
                            {fmt(capacity.used_cbm, 2)} <span className="text-[14px] font-bold text-on-surface-variant">m³</span>
                        </p>
                    </div>
                    {capacity.cbm !== null && (
                        <span className={`rounded-[999px] px-2.5 py-1 text-[13px] font-extrabold ${pct >= 100 ? "bg-error-container text-on-error-container" : pct >= 85 ? "bg-warning-container text-on-warning-container" : "bg-primary-container text-on-primary-container"}`}>
                            {pct}% full
                        </span>
                    )}
                </div>

                {capacity.cbm !== null ? (
                    <>
                        <div className="mt-3 h-3 overflow-hidden rounded-[999px] bg-surface-container">
                            <div className={`h-full rounded-[999px] ${bar} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <div className="mt-2 flex justify-between text-[12px] text-on-surface-variant">
                            <span>Free {fmt(capacity.free_cbm ?? 0, 2)} m³</span>
                            <span>Capacity {fmt(capacity.cbm, 2)} m³</span>
                        </div>
                    </>
                ) : (
                    <p className="mt-2 text-[13px] text-on-surface-variant">No capacity set, so there's no % full yet.</p>
                )}

                {canEdit &&
                    (open ? (
                        <form onSubmit={save} className="mt-3 flex items-center gap-2">
                            <label className="flex flex-1 items-center gap-1 rounded-[12px] border border-outline-variant bg-surface-container-low px-3 focus-within:border-primary">
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    inputMode="decimal"
                                    autoFocus
                                    value={form.data.capacity_cbm}
                                    onChange={(e) => form.setData("capacity_cbm", e.target.value)}
                                    placeholder="e.g. 450"
                                    aria-label="Capacity in cubic metres"
                                    className="w-full border-0 bg-transparent px-0 py-2 text-[15px] focus:ring-0"
                                />
                                <span className="text-[13px] font-bold text-on-surface-variant">m³</span>
                            </label>
                            <button type="submit" disabled={form.processing} className="rounded-[12px] bg-primary px-4 py-2.5 text-[14px] font-bold text-on-primary disabled:opacity-60">Save</button>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="rounded-[12px] px-2 py-2.5 text-on-surface-variant hover:bg-surface-container">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </form>
                    ) : (
                        <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-outline-variant py-2 text-[13px] font-bold text-primary hover:bg-surface-container-low">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                            {capacity.cbm !== null ? "Change capacity" : "Set capacity"}
                        </button>
                    ))}
                {form.errors.capacity_cbm && <p className="mt-1 text-[12px] text-error">{form.errors.capacity_cbm}</p>}
            </div>
        </section>
    );
}

/** One item: packaging-first amount, a meter against its lines, and its status. */
function LevelCard({ row, canEdit, onEdit }: { row: LevelRow; canEdit: boolean; onEdit: () => void }) {
    const status = STATUS[row.status];
    const level = row.level;
    const lead = row.lead;
    const pos = (n: number) => (level ? `${Math.min(100, (n / level.max) * 100)}%` : "0%");

    return (
        <li className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-surface-container-lowest p-3.5 shadow-sm sm:p-4 xl:flex-row xl:items-center xl:gap-5">
            {/* Item */}
            <div className="flex min-w-0 items-center gap-3 xl:w-[34%]">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-outline-variant/70 bg-surface-container-low">
                    {row.image ? (
                        <img src={row.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                        <span className="material-symbols-outlined text-[26px] text-on-surface-variant/60">inventory_2</span>
                    )}
                </div>
                <div className="min-w-0">
                    <Link href={route("stock_keeper.items.show", row.item_id)} className="block truncate text-[15px] font-bold text-on-surface hover:underline">
                        {row.name}
                    </Link>
                    <p className="truncate font-mono text-[11px] text-on-surface-variant">
                        {row.skus.slice(0, 2).join(" · ")}
                        {row.skus.length > 2 ? ` +${row.skus.length - 2}` : ""}
                    </p>
                    {row.areas && row.areas.length > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] font-bold text-primary">
                            <span className="material-symbols-outlined text-[15px]">grid_view</span>
                            Area {row.areas.join(", ")}
                        </p>
                    )}
                </div>
            </div>

            {/* Amount: the biggest packaging leads. */}
            <div className="flex items-end justify-between gap-3 xl:w-[22%] xl:flex-col xl:items-start xl:justify-center xl:gap-0.5">
                <div>
                    <p className="text-[26px] font-extrabold leading-none tabular-nums text-on-surface">
                        {lead ? fmt(lead.count) : 0}{" "}
                        <span className="text-[15px] font-bold text-on-surface-variant">{lead ? plural(lead.unit, lead.count) : row.unit.name}</span>
                    </p>
                    {row.display.includes("·") && <p className="mt-1 text-[12px] text-on-surface-variant">{row.display}</p>}
                </div>
                <StatusPill tone={status.tone} label={status.label} icon={status.icon} className="xl:mt-1.5" />
            </div>

            {/* Meter against the lines. */}
            <div className="min-w-0 flex-1">
                {level ? (
                    <>
                        <div className="relative h-3 rounded-[999px] bg-surface-container">
                            <div className={`h-full rounded-[999px] ${status.bar}`} style={{ width: `${Math.min(100, (row.fill ?? 0) * 100)}%` }} />
                            <span className="absolute -top-1 h-5 w-0.5 rounded-[999px] bg-error" style={{ left: pos(level.critical) }} title="Crit low" />
                            <span className="absolute -top-1 h-5 w-0.5 rounded-[999px] bg-warning" style={{ left: pos(level.low) }} title="Low stock" />
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-[12px]">
                            <span className="text-on-surface-variant">
                                Crit <b className="text-on-surface">{fmt(level.critical)}</b>
                            </span>
                            <span className="text-center text-on-surface-variant">
                                Low <b className="text-on-surface">{fmt(level.low)}</b>
                            </span>
                            <span className="text-right text-on-surface-variant">
                                Full <b className="text-on-surface">{fmt(level.max)} {plural(row.unit.name, level.max)}</b>
                            </span>
                        </div>
                        {row.to_full !== null && row.to_full > 0 && (
                            <p className="mt-1 text-[12px] font-bold text-primary">
                                {fmt(row.to_full, 1)} {plural(row.unit.name, row.to_full)} to full
                            </p>
                        )}
                    </>
                ) : (
                    <p className="rounded-[12px] border border-dashed border-outline-variant px-3 py-2 text-[13px] text-on-surface-variant">
                        No levels set. Set full, low and crit low to get alerts.
                    </p>
                )}
            </div>

            {canEdit && (
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center justify-center gap-1.5 rounded-[12px] border border-outline-variant px-3 py-2.5 text-[13px] font-bold text-primary hover:bg-surface-container-low xl:shrink-0"
                >
                    <span className="material-symbols-outlined text-[18px]">tune</span>
                    {level ? "Edit levels" : "Set levels"}
                </button>
            )}
        </li>
    );
}

/** Set full / low / crit low in one of the item's pack units. Sheet on phones, dialog from sm. */
function LevelSheet({ row, locationId, locationName, onClose }: { row: LevelRow; locationId: number; locationName: string; onClose: () => void }) {
    const form = useForm({
        item_packaging_type_id: row.unit.id !== null ? String(row.unit.id) : "",
        max: row.level ? String(row.level.max) : "",
        low: row.level ? String(row.level.low) : "",
        critical: row.level ? String(row.level.critical) : "",
    });
    const unit = row.units.find((u) => String(u.id) === form.data.item_packaging_type_id) ?? row.unit;
    const max = Number(form.data.max);
    const low = Number(form.data.low);
    const crit = Number(form.data.critical);
    const filled = form.data.max !== "" && form.data.low !== "" && form.data.critical !== "";
    const ordered = filled && max >= 1 && low <= max && crit <= low && crit >= 0;
    const nowInUnit = row.pieces / Math.max(1, unit.pieces);

    React.useEffect(() => {
        const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [onClose]);

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        form.put(route("stock_keeper.levels.update", [locationId, row.item_id]), { preserveScroll: true, onSuccess: onClose });
    };
    const clear = () =>
        router.delete(route("stock_keeper.levels.destroy", [locationId, row.item_id]), { preserveScroll: true, onSuccess: onClose });

    const field = (key: "max" | "low" | "critical", label: string, hint: string, dot: string) => (
        <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-on-surface">
                <span className={`h-2 w-2 rounded-[999px] ${dot}`} />
                {label}
            </span>
            <span className="flex items-center rounded-[12px] border border-outline-variant bg-surface-container-low px-3 focus-within:border-primary">
                <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.data[key]}
                    onChange={(e) => form.setData(key, e.target.value)}
                    className="w-full border-0 bg-transparent px-0 py-2.5 text-[16px] font-bold tabular-nums focus:ring-0"
                />
                <span className="text-[13px] font-bold text-on-surface-variant">{plural(unit.name, Number(form.data[key]) || 0)}</span>
            </span>
            <span className="mt-1 block text-[12px] text-on-surface-variant">{hint}</span>
        </label>
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Levels for ${row.name}`}>
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-surface/40" />
            <form
                onSubmit={save}
                className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-outline-variant bg-surface-container-lowest p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[520px] sm:rounded-[24px] sm:p-6"
            >
                <div className="mx-auto mb-3 h-1 w-10 rounded-[999px] bg-outline-variant sm:hidden" />
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">{locationName}</p>
                        <h2 className="truncate text-[18px] font-extrabold text-on-surface">{row.name}</h2>
                        <p className="text-[13px] text-on-surface-variant">
                            Now {fmt(nowInUnit, 1)} {plural(unit.name, nowInUnit)} ({row.display})
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded-[10px] p-1.5 text-on-surface-variant hover:bg-surface-container">
                        <span className="material-symbols-outlined text-[22px]">close</span>
                    </button>
                </div>

                {row.units.length > 1 && (
                    <div className="mb-4">
                        <p className="mb-1.5 text-[13px] font-bold text-on-surface">Count in</p>
                        <div className="flex flex-wrap gap-2">
                            {row.units.map((u) => {
                                const on = String(u.id) === form.data.item_packaging_type_id;
                                return (
                                    <button
                                        key={String(u.id)}
                                        type="button"
                                        onClick={() => form.setData("item_packaging_type_id", u.id !== null ? String(u.id) : "")}
                                        className={`rounded-[999px] border px-3 py-1.5 text-[13px] font-bold ${on ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant hover:border-primary"}`}
                                    >
                                        {u.name}
                                        {u.pieces > 1 && <span className="ml-1 font-medium opacity-80">· {u.pieces} pcs</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {field("max", "Full", "What it's set to hold", "bg-info")}
                    {field("low", "Low stock", "Alert at or below", "bg-warning")}
                    {field("critical", "Crit low", "Urgent at or below", "bg-error")}
                </div>

                {filled && !ordered && (
                    <p className="mt-3 rounded-[12px] bg-error-container px-3 py-2 text-[13px] text-on-error-container">
                        Keep crit low ≤ low stock ≤ full, with full at least 1.
                    </p>
                )}
                {(form.errors.max || form.errors.low || form.errors.critical) && (
                    <p className="mt-3 text-[13px] text-error">{form.errors.max ?? form.errors.low ?? form.errors.critical}</p>
                )}

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    {row.level ? (
                        <button type="button" onClick={clear} className="rounded-[12px] px-4 py-2.5 text-[14px] font-bold text-error hover:bg-error-container/50">
                            Clear levels
                        </button>
                    ) : (
                        <span />
                    )}
                    <button
                        type="submit"
                        disabled={!ordered || form.processing}
                        className="rounded-[12px] bg-primary px-6 py-3 text-[15px] font-bold text-on-primary shadow-sm disabled:opacity-50"
                    >
                        Save levels
                    </button>
                </div>
            </form>
        </div>
    );
}

Levels.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
