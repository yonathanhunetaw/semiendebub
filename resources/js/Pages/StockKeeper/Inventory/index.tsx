import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import ItemVariantPicker from "@/Components/Shared/ItemVariantPicker";
import { SkButton, SkCard, SkField, SkHeader, SkPager, SkSearch, SkSheet, SkStats, STOCK_STATUS, fmt, inputClass, plural, when } from "@/Components/StockKeeper/skKit";
import type { ItemStockRow, ItemVariantStockRow, StockKeeperInventoryProps, StockRow } from "@/types/stockkeeper";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The stock ledger, read the way the floor reads it: one row per item, in its
 * biggest packaging first ("30 Cartons · 17 Pieces"), a shop shelf in single
 * units. The SKU rows sit one tap away, because a receipt or a recount is
 * always written against a SKU.
 */
export default function Inventory({ items = [], locations = [], filters, metrics, pagination }: StockKeeperInventoryProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);
    const [receiveOpen, setReceiveOpen] = React.useState(false);
    const [adjustRow, setAdjustRow] = React.useState<StockRow | null>(null);
    const [openItem, setOpenItem] = React.useState<number | null>(null);
    const [variantRows, setVariantRows] = React.useState<Record<number, ItemVariantStockRow[]>>({});
    const [loadingItem, setLoadingItem] = React.useState<number | null>(null);
    const [loadError, setLoadError] = React.useState<number | null>(null);

    const selectedLocation = filters.location_type && filters.location_id ? `${filters.location_type}#${filters.location_id}` : "";

    const applyFilters = React.useCallback(
        (next: { search?: string; location?: string | null; page?: number }) => {
            const query: Record<string, string | number> = {};
            const nextSearch = next.search ?? filters.search;
            if (nextSearch) query.search = nextSearch;
            const location = next.location !== undefined ? next.location : selectedLocation || null;
            if (location) {
                const [type, id] = location.split("#");
                query.location_type = type;
                query.location_id = Number(id);
            }
            if (next.page) query.page = next.page;
            router.get(route("stock_keeper.inventory.index"), query, { preserveState: true, preserveScroll: true, replace: true });
        },
        [filters.search, selectedLocation],
    );

    React.useEffect(() => setSearch(filters.search), [filters.search]);
    React.useEffect(() => {
        if (search === filters.search) return;
        const timer = window.setTimeout(() => applyFilters({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [search, filters.search, applyFilters]);

    // SKU rows load on demand: 182 items carry 1,600+ SKUs and few are looked at.
    const toggleItem = async (row: ItemStockRow) => {
        if (openItem === row.item_id) return setOpenItem(null);
        setOpenItem(row.item_id);
        if (variantRows[row.item_id]) return;
        setLoadingItem(row.item_id);
        setLoadError(null);
        try {
            const params = new URLSearchParams();
            if (filters.location_type) params.set("location_type", filters.location_type);
            if (filters.location_id) params.set("location_id", String(filters.location_id));
            const response = await fetch(`${route("stock_keeper.inventory.items.variants", row.item_id)}?${params.toString()}`, { headers: { Accept: "application/json" } });
            const payload = await response.json();
            setVariantRows((current) => ({ ...current, [row.item_id]: payload.variants ?? [] }));
        } catch {
            setLoadError(row.item_id);
        } finally {
            setLoadingItem(null);
        }
    };

    // The adjust sheet writes against a ledger row; shape a SKU row into one.
    const adjustVariant = (item: ItemStockRow, v: ItemVariantStockRow) =>
        setAdjustRow({
            id: v.stock_id,
            variant_id: v.variant_id,
            item_id: item.item_id,
            product_name: item.product_name,
            sku: v.sku,
            variant_label: v.variant_label,
            location_name: v.location_name,
            location_kind: "store",
            quantity: v.quantity,
            unit: v.unit,
            pieces_per_unit: v.pieces_per_unit,
            pieces: v.pieces,
            min_stock_level: v.min_stock_level,
            headroom: v.quantity - v.min_stock_level,
            status: item.status,
            updated_at: v.updated_at,
        });

    const cols = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_110px_120px_140px_44px]";

    return (
        <>
            <Head title="Stock" />

            <SkHeader
                title="Stock"
                subtitle="Every item on hand, in the units the place it sits is counted in."
                actions={
                    <SkButton icon="add_box" onClick={() => setReceiveOpen(true)}>
                        Receive stock
                    </SkButton>
                }
            />

            <SkStats
                items={[
                    { label: "Items on hand", value: fmt(metrics.items), hint: `${fmt(metrics.variants)} SKUs`, icon: "category" },
                    { label: "Pieces on hand", value: fmt(metrics.pieces_on_hand), hint: "All packaging, in pieces", icon: "deployed_code" },
                    { label: "Items low", value: fmt(metrics.low_stock_items), icon: "trending_down", tone: metrics.low_stock_items > 0 ? "warning" : undefined },
                    { label: "Items out", value: fmt(metrics.out_of_stock_items), icon: "remove_shopping_cart", tone: metrics.out_of_stock_items > 0 ? "error" : undefined },
                ]}
            />

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_280px]">
                <SkSearch value={search} onChange={setSearch} placeholder="Search product, SKU or barcode" />
                <select value={selectedLocation} onChange={(e) => applyFilters({ location: e.target.value || null, page: 1 })} className={`${inputClass} bg-surface-container-lowest shadow-sm`} aria-label="Place">
                    <option value="">All places</option>
                    {locations.map((l) => (
                        <option key={`${l.kind}-${l.id}`} value={`${l.type}#${l.id}`}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </div>

            {items.length === 0 ? (
                <EmptyState icon="inventory_2" title="No items match" description="Change the search or pick another place." framed />
            ) : (
                <SkCard className="overflow-hidden">
                    {/* Column heads, desktop only. */}
                    <div className={`hidden gap-3 border-b border-outline-variant/70 bg-surface-container-low px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant lg:grid ${cols}`}>
                        <span>Item</span>
                        <span>On hand</span>
                        <span className="text-right">Pieces</span>
                        <span>Status</span>
                        <span>Updated</span>
                        <span />
                    </div>
                    <ul className="divide-y divide-outline-variant/60">
                        {items.map((row) => {
                            const expanded = openItem === row.item_id;
                            const lead = row.units[0];
                            const status = STOCK_STATUS[row.status];
                            const skus = variantRows[row.item_id] ?? [];
                            return (
                                <li key={row.item_id}>
                                    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 ${cols}`}>
                                        <div className="min-w-0">
                                            <Link href={route("stock_keeper.items.show", row.item_id)} className="block truncate text-[15px] font-bold text-on-surface hover:underline">
                                                {row.product_name}
                                            </Link>
                                            <p className="truncate font-mono text-[11px] text-on-surface-variant">
                                                {row.item_sku ?? "—"} · {row.variant_count} {plural("SKU", row.variant_count)}
                                            </p>
                                        </div>
                                        <div className="text-right lg:text-left">
                                            <p className="text-[18px] font-extrabold leading-tight tabular-nums text-on-surface">
                                                {lead ? fmt(lead.count) : 0} <span className="text-[13px] font-bold text-on-surface-variant">{lead ? plural(lead.unit, lead.count) : ""}</span>
                                            </p>
                                            {row.units.length > 1 && <p className="text-[12px] text-on-surface-variant">{row.display}</p>}
                                            {row.display_mode === "smallest" && <p className="text-[11px] text-on-surface-variant">shop shelf · single units</p>}
                                        </div>
                                        <p className="hidden text-right text-[13px] tabular-nums text-on-surface-variant lg:block">{fmt(row.pieces)}</p>
                                        <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-1 lg:block">
                                            <StatusPill tone={status.tone} label={status.label} size="sm" />
                                            <span className="text-[12px] text-on-surface-variant lg:hidden">{when(row.updated_at)}</span>
                                        </div>
                                        <p className="hidden text-[12px] text-on-surface-variant lg:block">{when(row.updated_at)}</p>
                                        <button
                                            type="button"
                                            onClick={() => void toggleItem(row)}
                                            aria-expanded={expanded}
                                            aria-label={expanded ? "Hide SKUs" : "Show SKUs"}
                                            className="col-span-2 flex items-center justify-center gap-1 rounded-[10px] border border-outline-variant py-1.5 text-[13px] font-bold text-primary hover:bg-surface-container-low lg:col-span-1 lg:border-0 lg:py-1"
                                        >
                                            <span className="lg:hidden">{expanded ? "Hide SKUs" : "SKUs & adjust"}</span>
                                            <span className="material-symbols-outlined text-[20px]">{expanded ? "expand_less" : "expand_more"}</span>
                                        </button>
                                    </div>

                                    {expanded && (
                                        <div className="bg-surface-container-low/60 px-4 pb-3 pt-1">
                                            {loadingItem === row.item_id ? (
                                                <p className="py-2 text-[13px] text-on-surface-variant">Loading SKUs…</p>
                                            ) : loadError === row.item_id ? (
                                                <p className="py-2 text-[13px] text-error">Couldn't load the SKUs for this item.</p>
                                            ) : skus.length === 0 ? (
                                                <p className="py-2 text-[13px] text-on-surface-variant">No ledger rows for this item here.</p>
                                            ) : (
                                                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                                    {skus.map((v) => (
                                                        <li key={v.stock_id} className="flex items-center gap-3 rounded-[14px] border border-outline-variant/70 bg-surface-container-lowest p-3">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate font-mono text-[13px] font-bold text-on-surface">{v.sku ?? "—"}</p>
                                                                <p className="truncate text-[12px] text-on-surface-variant">
                                                                    {v.variant_label || "—"} · {v.location_name}
                                                                </p>
                                                                <p className="mt-1 text-[14px] font-extrabold tabular-nums text-on-surface">
                                                                    {fmt(v.quantity)} {plural(v.unit, v.quantity)}
                                                                    <span className="ml-1.5 text-[12px] font-medium text-on-surface-variant">
                                                                        {fmt(v.pieces)} pcs · min {fmt(v.min_stock_level)}
                                                                    </span>
                                                                </p>
                                                            </div>
                                                            <SkButton variant="outline" icon="edit" onClick={() => adjustVariant(row, v)} className="shrink-0 px-3 py-2 text-[13px]">
                                                                Adjust
                                                            </SkButton>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </SkCard>
            )}

            <SkPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} noun="items" onPage={(page) => applyFilters({ page })} />

            <ReceiveSheet open={receiveOpen} onClose={() => setReceiveOpen(false)} locations={locations} />
            <AdjustSheet row={adjustRow} onClose={() => setAdjustRow(null)} />
        </>
    );
}

/** Receive: item first, then its SKU (ItemVariantPicker), the place and how many. */
function ReceiveSheet({ open, onClose, locations }: { open: boolean; onClose: () => void; locations: StockKeeperInventoryProps["locations"] }) {
    const form = useForm<{ item_variant_id: number | ""; location_type: string; location_id: number | ""; quantity: number | ""; min_stock_level: number | "" }>({
        item_variant_id: "",
        location_type: "",
        location_id: "",
        quantity: 1,
        min_stock_level: "",
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route("stock_keeper.inventory.receive"), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                onClose();
            },
        });
    };

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            title="Receive stock"
            subtitle="Book stock in at a place, counted in the SKU's own packaging."
            footer={
                <>
                    <SkButton variant="ghost" onClick={onClose}>Cancel</SkButton>
                    <SkButton type="submit" form="sk-receive" disabled={form.processing || form.data.item_variant_id === ""}>Receive</SkButton>
                </>
            }
        >
            <form id="sk-receive" onSubmit={submit} className="flex flex-col gap-3">
                <ItemVariantPicker open={open} value={form.data.item_variant_id} onChange={(id) => form.setData("item_variant_id", id)} error={form.errors.item_variant_id} />
                <SkField label="Place" error={form.errors.location_id ?? form.errors.location_type}>
                    <select
                        value={form.data.location_type && form.data.location_id ? `${form.data.location_type}#${form.data.location_id}` : ""}
                        onChange={(e) => {
                            const [type, id] = e.target.value.split("#");
                            form.setData((c) => ({ ...c, location_type: type ?? "", location_id: id ? Number(id) : "" }));
                        }}
                        className={inputClass}
                    >
                        <option value="">Choose a place…</option>
                        {locations.map((l) => (
                            <option key={`${l.kind}-${l.id}`} value={`${l.type}#${l.id}`}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                </SkField>
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="Quantity" error={form.errors.quantity}>
                        <input type="number" min={1} inputMode="numeric" value={form.data.quantity} onChange={(e) => form.setData("quantity", e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
                    </SkField>
                    <SkField label="Minimum (optional)" error={form.errors.min_stock_level} hint="Alert below this">
                        <input type="number" min={0} inputMode="numeric" value={form.data.min_stock_level} onChange={(e) => form.setData("min_stock_level", e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
                    </SkField>
                </div>
            </form>
        </SkSheet>
    );
}

function AdjustSheet({ row, onClose }: { row: StockRow | null; onClose: () => void }) {
    const form = useForm<{ counted_quantity: number | ""; min_stock_level: number | ""; notes: string }>({ counted_quantity: 0, min_stock_level: "", notes: "" });

    React.useEffect(() => {
        if (row) form.setData({ counted_quantity: row.quantity, min_stock_level: row.min_stock_level, notes: "" });
        // setData is stable in Inertia's useForm.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (row) form.patch(route("stock_keeper.inventory.adjust", row.id), { preserveScroll: true, onSuccess: onClose });
    };
    const delta = row && form.data.counted_quantity !== "" ? Number(form.data.counted_quantity) - row.quantity : 0;
    const unit = row?.unit ?? "unit";

    return (
        <SkSheet
            open={row !== null}
            onClose={onClose}
            title="Adjust count"
            subtitle={row ? `${row.product_name} · ${row.sku ?? ""} · ${row.location_name}` : ""}
            footer={
                <>
                    <SkButton variant="ghost" onClick={onClose}>Cancel</SkButton>
                    <SkButton type="submit" form="sk-adjust" disabled={form.processing}>Save count</SkButton>
                </>
            }
        >
            <form id="sk-adjust" onSubmit={submit} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <SkField label={`Counted (${plural(unit, 2)})`} error={form.errors.counted_quantity} hint={delta === 0 ? "Matches the system." : `${delta > 0 ? "+" : ""}${fmt(delta)} against the system.`}>
                        <input type="number" min={0} inputMode="numeric" value={form.data.counted_quantity} onChange={(e) => form.setData("counted_quantity", e.target.value === "" ? "" : Number(e.target.value))} className={`${inputClass} text-[18px] font-extrabold`} />
                    </SkField>
                    <SkField label="Minimum" error={form.errors.min_stock_level}>
                        <input type="number" min={0} inputMode="numeric" value={form.data.min_stock_level} onChange={(e) => form.setData("min_stock_level", e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
                    </SkField>
                </div>
                <SkField label="Notes (optional)" error={form.errors.notes}>
                    <textarea rows={2} value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} className={inputClass} />
                </SkField>
            </form>
        </SkSheet>
    );
}

Inventory.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
