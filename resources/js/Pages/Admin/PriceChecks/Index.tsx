import React from "react";
import { Head, router, usePage } from "@inertiajs/react";
import AdminLayout from "@/Layouts/AdminLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkButton, SkChips, SkField, SkHeader, SkSheet, inputClass } from "@/Components/StockKeeper/skKit";
import { PriceCheckCards } from "@/Components/Procurement/PriceCheckPanel";
import CheckDetailsFields, { EMPTY_CHECK, type CheckDetails } from "@/Components/Procurement/CheckDetailsFields";
import type { PriceCheckListProps, PriceCheckStatus } from "@/types/procurement";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Price checks at the active store: ideas sent to price check, and items we
 * already sell whose price an admin wants checked against other shops.
 */
export default function AdminPriceChecks({ checks = [], tab, counts, toVerify, routePrefix, stores = [], staff = {} }: PriceCheckListProps) {
    const [opening, setOpening] = React.useState(false);

    return (
        <>
            <Head title="Price checks" />
            <SkHeader
                title="Price checks"
                subtitle={`Sellers write down what other shops charge; someone else verifies each price.${toVerify > 0 ? ` ${toVerify} waiting to be checked.` : ""}`}
                actions={
                    stores.length > 0 ? (
                        <SkButton icon="add" onClick={() => setOpening(true)}>
                            Check an item we sell
                        </SkButton>
                    ) : null
                }
            />

            <div className="mb-3">
                <SkChips<PriceCheckStatus>
                    value={tab}
                    onChange={(next) => router.get(route(`${routePrefix}.index`), next === "open" ? {} : { tab: next }, { preserveState: true, replace: true })}
                    options={[
                        { value: "open", label: "Open", count: counts.open || undefined },
                        { value: "closed", label: "Closed", count: counts.closed || undefined },
                    ]}
                />
            </div>

            {checks.length === 0 ? (
                <EmptyState framed icon="price_check" title="No price checks here" description="Send a product idea to price check, or check an item we already sell." />
            ) : (
                <PriceCheckCards checks={checks} routePrefix={routePrefix} />
            )}

            <OpenCheckSheet open={opening} onClose={() => setOpening(false)} stores={stores} staff={staff} action={route(`${routePrefix}.store`)} />
        </>
    );
}

function OpenCheckSheet({ open, onClose, stores, staff, action }: { open: boolean; onClose: () => void; stores: Array<{ id: number; name: string }>; staff: Record<string, Array<{ id: number; name: string }>>; action: string }) {
    const { activeStore } = usePage<{ activeStore?: { id: number | "all" } }>().props;
    const initialStore = typeof activeStore?.id === "number" ? activeStore.id : stores[0]?.id;

    const [storeId, setStoreId] = React.useState<number | undefined>(initialStore);
    const [details, setDetails] = React.useState<CheckDetails>(EMPTY_CHECK);
    const [query, setQuery] = React.useState("");
    const [options, setOptions] = React.useState<Array<{ id: number; name: string }>>([]);
    const [item, setItem] = React.useState<{ id: number; name: string } | null>(null);
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!open || item) return;
        let cancelled = false;
        const handle = window.setTimeout(async () => {
            try {
                const response = await fetch(`${route("admin.inventory.item_options")}?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
                const payload = await response.json();
                if (!cancelled) setOptions(payload.items ?? []);
            } catch {
                if (!cancelled) setOptions([]);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [open, query, item]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!item || !storeId) return;
        setBusy(true);
        router.post(
            action,
            { item_id: item.id, store_id: storeId, shops_wanted: details.shops_wanted, due_on: details.due_on || null, assignee_ids: details.assignee_ids, note: details.note || null },
            {
                onError: (e) => setErrors(e),
                onSuccess: () => {
                    setItem(null);
                    setDetails(EMPTY_CHECK);
                    onClose();
                },
                onFinish: () => setBusy(false),
            },
        );
    };

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            title="Check an item we sell"
            subtitle="The store's sellers find out what other shops charge for it."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton type="submit" form="open-check" icon="price_check" disabled={busy || !item || !storeId}>
                        Open the check
                    </SkButton>
                </div>
            }
        >
            <form id="open-check" onSubmit={submit} className="space-y-4">
                <SkField label="Item" error={errors.item_id}>
                    {item ? (
                        <div className="flex items-center justify-between rounded-[12px] border border-primary bg-primary-container/40 px-3 py-2.5 text-[15px]">
                            <span className="font-semibold">{item.name}</span>
                            <button type="button" className="text-[13px] font-semibold text-primary" onClick={() => setItem(null)}>
                                Change
                            </button>
                        </div>
                    ) : (
                        <>
                            <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, SKU or barcode…" autoFocus />
                            <ul className="mt-2 max-h-[200px] overflow-y-auto rounded-[12px] border border-outline-variant">
                                {options.map((o) => (
                                    <li key={o.id}>
                                        <button type="button" onClick={() => setItem(o)} className="w-full px-3 py-2 text-left text-[14px] hover:bg-surface-container-low">
                                            {o.name}
                                        </button>
                                    </li>
                                ))}
                                {options.length === 0 ? <li className="px-3 py-2 text-[13px] text-on-surface-variant">No items match.</li> : null}
                            </ul>
                        </>
                    )}
                </SkField>
                {stores.length > 1 ? (
                    <SkField label="Which store's sellers check" error={errors.store_id}>
                        <select
                            className={inputClass}
                            value={storeId ?? ""}
                            onChange={(e) => {
                                setStoreId(Number(e.target.value));
                                setDetails({ ...details, assignee_ids: [] });
                            }}
                        >
                            {stores.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </SkField>
                ) : null}
                <CheckDetailsFields value={details} onChange={setDetails} staff={storeId ? (staff[String(storeId)] ?? []) : []} errors={errors} />
            </form>
        </SkSheet>
    );
}

AdminPriceChecks.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
