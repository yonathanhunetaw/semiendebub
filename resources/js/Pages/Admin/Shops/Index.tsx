import React from "react";
import { Head, router, useForm } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkField, SkHeader, SkSearch, SkSheet, inputClass } from "@/Components/StockKeeper/skKit";
import type { MarketShop } from "@/types/procurement";

interface Props {
    shops?: MarketShop[];
    filters: { search: string };
    storeId: number | null;
    canSetMode: boolean;
}

const SEARCH_DEBOUNCE_MS = 350;

const MODES: Array<{ value: "check" | "avoid" | "none"; label: string }> = [
    { value: "check", label: "Check" },
    { value: "avoid", label: "Avoid" },
    { value: "none", label: "Not listed" },
];

/**
 * The other shops in the market. Any admin keeps the list; for the store in
 * the dropdown, its admin marks which shops its sellers check and which they
 * avoid. Only "check" shops are offered on a price check.
 */
export default function AdminShops({ shops = [], filters, storeId, canSetMode }: Props) {
    const [search, setSearch] = React.useState(filters.search);
    const [editing, setEditing] = React.useState<MarketShop | "new" | null>(null);

    React.useEffect(() => {
        if (search === filters.search) return;
        const t = window.setTimeout(
            () => router.get(route("admin.shops.index"), search ? { search } : {}, { preserveState: true, preserveScroll: true, replace: true }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => window.clearTimeout(t);
    }, [search, filters.search]);

    const setMode = (shop: MarketShop, mode: "check" | "avoid" | "none") =>
        storeId !== null && router.put(route("admin.shops.mode", shop.id), { store_id: storeId, mode }, { preserveScroll: true });

    return (
        <>
            <Head title="Shops" />
            <SkHeader
                title="Shops"
                subtitle={
                    storeId === null
                        ? "The other shops in the market, where sellers check prices. Pick a store at the top to choose which shops it checks."
                        : "The other shops in the market. For this store, mark which ones its sellers check and which they avoid."
                }
                actions={
                    <SkButton icon="add" onClick={() => setEditing("new")}>
                        Add a shop
                    </SkButton>
                }
            />

            <div className="mb-3 sm:max-w-[360px]">
                <SkSearch value={search} onChange={setSearch} placeholder="Name or area…" />
            </div>

            {shops.length === 0 ? (
                <EmptyState framed icon="storefront" title="No shops yet" description="Add the shops nearby that sell what we sell." />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shops.map((shop) => (
                        <SkCard key={shop.id}>
                            <div className="flex items-start justify-between gap-3 p-4">
                                <div className="min-w-0">
                                    <p className="truncate text-[15px] font-bold text-on-surface">{shop.name}</p>
                                    <p className="text-[12px] text-on-surface-variant">
                                        {[shop.area, shop.phone].filter(Boolean).join(" · ") || "No area"}
                                    </p>
                                    {shop.checked_by.length > 0 ? <p className="mt-1 text-[12px] text-on-surface-variant">Checked by {shop.checked_by.join(", ")}</p> : null}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    {!shop.is_active ? <StatusPill label="Closed" tone="neutral" size="xs" /> : null}
                                    <button type="button" className="text-[12px] font-semibold text-primary" onClick={() => setEditing(shop)}>
                                        Edit
                                    </button>
                                </div>
                            </div>
                            {storeId !== null ? (
                                <div className="flex gap-1 border-t border-outline-variant/60 p-2">
                                    {MODES.map((m) => (
                                        <button
                                            key={m.value}
                                            type="button"
                                            disabled={!canSetMode}
                                            aria-pressed={shop.mode === m.value}
                                            onClick={() => setMode(shop, m.value)}
                                            className={`flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold disabled:opacity-50 ${
                                                shop.mode === m.value
                                                    ? m.value === "check"
                                                        ? "bg-success text-on-success"
                                                        : m.value === "avoid"
                                                          ? "bg-error text-on-error"
                                                          : "bg-inverse-surface text-inverse-on-surface"
                                                    : "text-on-surface-variant hover:bg-surface-container"
                                            }`}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </SkCard>
                    ))}
                </div>
            )}

            <ShopSheet shop={editing} onClose={() => setEditing(null)} />
        </>
    );
}

function ShopSheet({ shop, onClose }: { shop: MarketShop | "new" | null; onClose: () => void }) {
    const existing = shop !== null && shop !== "new" ? shop : null;
    const form = useForm({ name: "", area: "", phone: "", notes: "", is_active: true });

    React.useEffect(() => {
        form.setData({
            name: existing?.name ?? "",
            area: existing?.area ?? "",
            phone: existing?.phone ?? "",
            notes: existing?.notes ?? "",
            is_active: existing?.is_active ?? true,
        });
        form.clearErrors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (existing) form.put(route("admin.shops.update", existing.id), options);
        else form.post(route("admin.shops.store"), options);
    };

    return (
        <SkSheet
            open={shop !== null}
            onClose={onClose}
            title={existing ? `Edit ${existing.name}` : "Add a shop"}
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton type="submit" form="shop-form" disabled={form.processing}>
                        Save
                    </SkButton>
                </div>
            }
        >
            <form id="shop-form" onSubmit={submit} className="space-y-4">
                <SkField label="Name" error={form.errors.name}>
                    <input className={inputClass} value={form.data.name} onChange={(e) => form.setData("name", e.target.value)} autoFocus />
                </SkField>
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="Area" error={form.errors.area}>
                        <input className={inputClass} value={form.data.area} onChange={(e) => form.setData("area", e.target.value)} placeholder="Merkato" />
                    </SkField>
                    <SkField label="Phone" error={form.errors.phone}>
                        <input className={inputClass} value={form.data.phone} onChange={(e) => form.setData("phone", e.target.value)} />
                    </SkField>
                </div>
                <SkField label="Notes" error={form.errors.notes}>
                    <textarea className={inputClass} rows={2} value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} />
                </SkField>
                <label className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" checked={form.data.is_active} onChange={(e) => form.setData("is_active", e.target.checked)} />
                    Open (closed shops are not offered on price checks)
                </label>
            </form>
        </SkSheet>
    );
}

AdminShops.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
