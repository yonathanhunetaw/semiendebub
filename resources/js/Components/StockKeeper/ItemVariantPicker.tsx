import React from "react";
import { inputClass, plural } from "@/Components/StockKeeper/skKit";

const SEARCH_DEBOUNCE_MS = 350;

interface ItemOption {
    id: number;
    name: string;
    variant_count: number;
}

interface VariantChoice {
    id: number;
    label: string;
    sku: string | null;
}

/**
 * Item first, then one of its SKUs, as when adding items to a shipment.
 * Items are searched on the server (the catalogue is too big to ship to the
 * page); an item's SKUs are fetched once it is chosen, and a single-SKU item
 * is picked straight away.
 */
export default function ItemVariantPicker({
    open,
    value,
    onChange,
    error,
}: {
    /** Search only while the surrounding sheet is open. */
    open: boolean;
    value: number | "";
    onChange: (variantId: number | "") => void;
    error?: string;
}) {
    const [query, setQuery] = React.useState("");
    const [options, setOptions] = React.useState<ItemOption[]>([]);
    const [searching, setSearching] = React.useState(false);
    const [item, setItem] = React.useState<ItemOption | null>(null);
    const [choices, setChoices] = React.useState<VariantChoice[]>([]);
    const [loadingChoices, setLoadingChoices] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setItem(null);
            setChoices([]);
            setQuery("");
        }
    }, [open]);

    React.useEffect(() => {
        if (!open || item) return;
        let cancelled = false;
        const handle = window.setTimeout(async () => {
            setSearching(true);
            try {
                const response = await fetch(`${route("stock_keeper.inventory.item_options")}?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
                const payload = await response.json();
                if (!cancelled) setOptions(payload.items ?? []);
            } catch {
                if (!cancelled) setOptions([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [query, open, item]);

    const chooseItem = async (next: ItemOption | null) => {
        setItem(next);
        onChange("");
        setChoices([]);
        if (!next) return;
        setLoadingChoices(true);
        try {
            const response = await fetch(route("stock_keeper.inventory.items.variant_options", next.id), { headers: { Accept: "application/json" } });
            const payload = await response.json();
            const list: VariantChoice[] = payload.variants ?? [];
            setChoices(list);
            if (list.length === 1) onChange(list[0].id);
        } catch {
            setChoices([]);
        } finally {
            setLoadingChoices(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <span className="mb-1 block text-[13px] font-bold text-on-surface">Item</span>
                {item ? (
                    <div className={`${inputClass} flex items-center justify-between gap-2`}>
                        <span className="truncate font-bold">{item.name}</span>
                        <button type="button" onClick={() => void chooseItem(null)} className="shrink-0 text-[13px] font-bold text-primary">
                            Change
                        </button>
                    </div>
                ) : (
                    <>
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, SKU or barcode" className={inputClass} />
                        <ul className="mt-1 max-h-56 overflow-y-auto rounded-[12px] border border-outline-variant/70">
                            {searching && options.length === 0 ? (
                                <li className="px-3 py-2 text-[13px] text-on-surface-variant">Searching…</li>
                            ) : options.length === 0 ? (
                                <li className="px-3 py-2 text-[13px] text-on-surface-variant">No item matches that search.</li>
                            ) : (
                                options.map((o) => (
                                    <li key={o.id}>
                                        <button type="button" onClick={() => void chooseItem(o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-container-low">
                                            <span className="truncate text-[14px] font-bold text-on-surface">{o.name}</span>
                                            <span className="shrink-0 text-[12px] text-on-surface-variant">
                                                {o.variant_count} {plural("SKU", o.variant_count)}
                                            </span>
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </>
                )}
            </div>

            {item && (
                <div>
                    <p className="mb-1 text-[13px] font-bold text-on-surface">Which SKU of {item.name}?</p>
                    {loadingChoices ? (
                        <p className="text-[13px] text-on-surface-variant">Loading SKUs…</p>
                    ) : choices.length === 0 ? (
                        <p className="text-[13px] text-on-surface-variant">This item has no SKUs set up yet.</p>
                    ) : (
                        <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                            {choices.map((c) => {
                                const on = value === c.id;
                                return (
                                    <button key={c.id} type="button" onClick={() => onChange(c.id)} className={`rounded-[12px] border-2 px-3 py-2 text-left ${on ? "border-primary bg-primary-container/40" : "border-outline-variant/70 hover:border-primary/60"}`}>
                                        <span className="block truncate text-[14px] font-bold text-on-surface">{c.label}</span>
                                        <span className="block truncate font-mono text-[12px] text-on-surface-variant">{c.sku ?? "No SKU"}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {error ? <p className="text-[12px] text-error">{error}</p> : null}
        </div>
    );
}
