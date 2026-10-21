import React from "react";
import { SkField, inputClass } from "@/Components/StockKeeper/skKit";

/**
 * How many shops, by when, and (optionally) which sellers: the fields a new
 * price check asks for, shared by "Send to price check" on an idea and
 * "Check an item we sell" on the price check list.
 */
export interface CheckDetails {
    shops_wanted: string;
    due_on: string;
    assignee_ids: number[];
    note: string;
}

export const EMPTY_CHECK: CheckDetails = { shops_wanted: "3", due_on: "", assignee_ids: [], note: "" };

export default function CheckDetailsFields({
    value,
    onChange,
    staff,
    errors = {},
}: {
    value: CheckDetails;
    onChange: (next: CheckDetails) => void;
    /** The store's sellers and managers who can be named. */
    staff: Array<{ id: number; name: string }>;
    errors?: Partial<Record<keyof CheckDetails, string>>;
}) {
    const toggle = (id: number) =>
        onChange({ ...value, assignee_ids: value.assignee_ids.includes(id) ? value.assignee_ids.filter((x) => x !== id) : [...value.assignee_ids, id] });

    return (
        <>
            <div className="grid grid-cols-2 gap-3">
                <SkField label="Shops to check" error={errors.shops_wanted}>
                    <input className={inputClass} type="number" min={1} max={50} inputMode="numeric" value={value.shops_wanted} onChange={(e) => onChange({ ...value, shops_wanted: e.target.value })} />
                </SkField>
                <SkField label="By" error={errors.due_on}>
                    <input className={inputClass} type="date" value={value.due_on} onChange={(e) => onChange({ ...value, due_on: e.target.value })} />
                </SkField>
            </div>
            <SkField label="Who checks" hint={value.assignee_ids.length === 0 ? "Nobody named: any seller of the store can." : "Only the people ticked can."}>
                {staff.length === 0 ? (
                    <p className="text-[13px] text-on-surface-variant">This store has no sellers to name.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {staff.map((p) => {
                            const on = value.assignee_ids.includes(p.id);
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggle(p.id)}
                                    className={`rounded-[999px] border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface"}`}
                                >
                                    {p.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </SkField>
            <SkField label="Note for the sellers" error={errors.note}>
                <input className={inputClass} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder="Ask for the bulk price too" />
            </SkField>
        </>
    );
}
