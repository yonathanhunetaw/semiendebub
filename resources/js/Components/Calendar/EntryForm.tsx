import React from "react";
import { useForm } from "@inertiajs/react";
import { format, parseISO } from "date-fns";
import { SkButton, SkField, SkSheet, inputClass } from "@/Components/StockKeeper/skKit";
import { KIND_ICON, KIND_LABEL, REPEAT_UNIT, calendarRoute } from "@/Components/Calendar/calendarUi";
import type { CalendarEventData, EntryKind, EntryRepeat, EntryVisibility } from "@/types/calendar";

/** Where the form opens: a fresh entry on a day (and time), or an existing one. */
export type EntryFormTarget = { mode: "create"; start: Date; end?: Date; allDay: boolean } | { mode: "edit"; event: CalendarEventData };

interface Props {
    app: string;
    scopeLabel: string;
    target: EntryFormTarget | null;
    onClose: () => void;
    onSaved: () => void;
}

interface FormData {
    title: string;
    kind: EntryKind;
    visibility: EntryVisibility;
    day: string;
    start_time: string;
    end_time: string;
    all_day: boolean;
    repeat: EntryRepeat;
    repeat_every: number;
    repeat_until: string;
    amount: string;
    currency: string;
    counterparty: string;
    notes: string;
    paid_now: boolean;
}

const KINDS: EntryKind[] = ["reminder", "bill", "shift", "meeting"];

const REPEATS: Array<{ value: EntryRepeat; label: string }> = [
    { value: "none", label: "Does not repeat" },
    { value: "daily", label: "Every day" },
    { value: "weekly", label: "Every week" },
    { value: "monthly", label: "Every month" },
    { value: "yearly", label: "Every year" },
];

function initial(target: EntryFormTarget | null): FormData {
    const blank: FormData = {
        title: "",
        kind: "reminder",
        visibility: "shared",
        day: format(new Date(), "yyyy-MM-dd"),
        start_time: "09:00",
        end_time: "10:00",
        all_day: true,
        repeat: "none",
        repeat_every: 1,
        repeat_until: "",
        amount: "",
        currency: "ETB",
        counterparty: "",
        notes: "",
        paid_now: false,
    };
    if (!target) return blank;

    if (target.mode === "create") {
        const end = target.end ?? new Date(target.start.getTime() + 60 * 60 * 1000);
        return { ...blank, day: format(target.start, "yyyy-MM-dd"), all_day: target.allDay, start_time: format(target.start, "HH:mm"), end_time: format(end, "HH:mm") };
    }

    const e = target.event;
    const entry = e.entry!;
    const start = parseISO(entry.starts_at);
    const end = entry.ends_at ? parseISO(entry.ends_at) : null;
    return {
        title: e.title,
        kind: e.kind as EntryKind,
        visibility: entry.visibility,
        day: format(start, "yyyy-MM-dd"),
        start_time: format(start, "HH:mm"),
        end_time: end ? format(end, "HH:mm") : format(new Date(start.getTime() + 60 * 60 * 1000), "HH:mm"),
        all_day: e.all_day,
        repeat: entry.repeat,
        repeat_every: entry.repeat_every,
        repeat_until: entry.repeat_until ?? "",
        amount: entry.amount !== null ? String(entry.amount) : "",
        currency: e.currency ?? "ETB",
        counterparty: entry.counterparty ?? "",
        notes: entry.notes ?? "",
        paid_now: false,
    };
}

/**
 * Add or change a calendar entry. A bill can repeat (rent, internet) and, when
 * added, be marked as already paid: that occurrence is ticked and the next one
 * waits on the calendar.
 */
export default function EntryForm({ app, scopeLabel, target, onClose, onSaved }: Props) {
    const form = useForm<FormData>(initial(target));
    const editing = target?.mode === "edit";
    const isBill = form.data.kind === "bill";

    React.useEffect(() => {
        form.setData(initial(target));
        form.clearErrors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const d = form.data;
        form.transform(() => ({
            title: d.title,
            kind: d.kind,
            visibility: d.visibility,
            all_day: d.all_day,
            starts_at: d.all_day ? d.day : `${d.day} ${d.start_time}`,
            ends_at: d.all_day ? null : `${d.day} ${d.end_time}`,
            repeat: d.repeat,
            repeat_every: d.repeat === "none" ? 1 : d.repeat_every,
            repeat_until: d.repeat === "none" || !d.repeat_until ? null : d.repeat_until,
            amount: d.amount === "" ? null : d.amount,
            currency: d.amount === "" ? null : d.currency,
            counterparty: d.counterparty || null,
            notes: d.notes || null,
            paid_now: !editing && isBill && d.paid_now,
        }));

        const options = { preserveScroll: true, preserveState: true, onSuccess: () => { onSaved(); onClose(); } };
        if (target?.mode === "edit") {
            form.put(route(calendarRoute(app, "entries.update"), target.event.entry!.id), options);
        } else {
            form.post(route(calendarRoute(app, "entries.store")), options);
        }
    };

    const err = form.errors as Partial<Record<string, string>>;
    const unit = form.data.repeat !== "none" ? REPEAT_UNIT[form.data.repeat] : null;

    return (
        <SkSheet
            open={target !== null}
            onClose={onClose}
            title={editing ? "Edit entry" : "Add to the calendar"}
            subtitle={editing && target.event.entry!.repeat !== "none" ? "Changes apply to every occurrence." : undefined}
            wide
            footer={
                <>
                    <SkButton variant="ghost" onClick={onClose}>Cancel</SkButton>
                    <SkButton type="submit" form="calendar-entry-form" icon="check" disabled={form.processing}>
                        {editing ? "Save" : isBill && form.data.paid_now ? "Save as paid" : "Add"}
                    </SkButton>
                </>
            }
        >
            <form id="calendar-entry-form" onSubmit={submit} className="space-y-4 pt-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {KINDS.map((k) => {
                        const on = form.data.kind === k;
                        return (
                            <button
                                key={k}
                                type="button"
                                aria-pressed={on}
                                onClick={() => form.setData("kind", k)}
                                className={`flex items-center justify-center gap-1.5 rounded-[12px] border px-3 py-2 text-[13px] font-bold transition-colors ${
                                    on ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{KIND_ICON[k]}</span>
                                {KIND_LABEL[k]}
                            </button>
                        );
                    })}
                </div>

                <SkField label="Title" error={err.title}>
                    <input
                        autoFocus
                        value={form.data.title}
                        onChange={(e) => form.setData("title", e.target.value)}
                        placeholder={isBill ? "e.g. Shop rent, Internet, Electricity" : form.data.kind === "shift" ? "e.g. Morning shift: Hana" : "What is it?"}
                        className={inputClass}
                        maxLength={160}
                    />
                </SkField>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                    <SkField label={isBill ? "Due (or paid) on" : "Day"} error={err.starts_at}>
                        <input type="date" value={form.data.day} onChange={(e) => form.setData("day", e.target.value)} className={inputClass} required />
                    </SkField>
                    <label className="flex items-center gap-2 self-end pb-2.5 text-[14px] font-bold text-on-surface">
                        <input type="checkbox" checked={form.data.all_day} onChange={(e) => form.setData("all_day", e.target.checked)} className="rounded border-outline-variant text-primary focus:ring-0" />
                        All day
                    </label>
                </div>

                {!form.data.all_day ? (
                    <div className="grid grid-cols-2 gap-3">
                        <SkField label="From">
                            <input type="time" value={form.data.start_time} onChange={(e) => form.setData("start_time", e.target.value)} className={inputClass} />
                        </SkField>
                        <SkField label="To" error={err.ends_at}>
                            <input type="time" value={form.data.end_time} onChange={(e) => form.setData("end_time", e.target.value)} className={inputClass} />
                        </SkField>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SkField label="Repeats" error={err.repeat}>
                        <select value={form.data.repeat} onChange={(e) => form.setData("repeat", e.target.value as EntryRepeat)} className={inputClass}>
                            {REPEATS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </SkField>
                    {unit ? (
                        <>
                            <SkField label={`Every how many ${unit[1]}`} error={err.repeat_every}>
                                <input type="number" min={1} max={365} value={form.data.repeat_every} onChange={(e) => form.setData("repeat_every", Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                            </SkField>
                            <SkField label="Until (optional)" error={err.repeat_until}>
                                <input type="date" value={form.data.repeat_until} min={form.data.day} onChange={(e) => form.setData("repeat_until", e.target.value)} className={inputClass} />
                            </SkField>
                        </>
                    ) : null}
                </div>

                {isBill || form.data.amount !== "" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_1fr]">
                        <SkField label="Amount" error={err.amount}>
                            <input type="number" min={0} step="0.01" inputMode="decimal" value={form.data.amount} onChange={(e) => form.setData("amount", e.target.value)} className={inputClass} />
                        </SkField>
                        <SkField label="Currency" error={err.currency}>
                            <input value={form.data.currency} maxLength={3} onChange={(e) => form.setData("currency", e.target.value.toUpperCase())} className={`${inputClass} uppercase`} />
                        </SkField>
                        <SkField label="Paid to" error={err.counterparty}>
                            <input value={form.data.counterparty} onChange={(e) => form.setData("counterparty", e.target.value)} placeholder="e.g. Ethio Telecom" className={inputClass} maxLength={160} />
                        </SkField>
                    </div>
                ) : null}

                {isBill && !editing ? (
                    <label className="flex items-start gap-3 rounded-[14px] border border-outline-variant bg-surface-container-low p-3">
                        <input type="checkbox" checked={form.data.paid_now} onChange={(e) => form.setData("paid_now", e.target.checked)} className="mt-0.5 rounded border-outline-variant text-success focus:ring-0" />
                        <span>
                            <span className="block text-[14px] font-bold text-on-surface">Already paid this one</span>
                            <span className="block text-[12px] text-on-surface-variant">
                                {form.data.repeat === "none"
                                    ? "It goes on the calendar as paid on that day."
                                    : "It goes on the calendar as paid on that day, and the next one waits as due."}
                                {" "}This is a note on the calendar: money still goes through Payments.
                            </span>
                        </span>
                    </label>
                ) : null}

                <SkField label="Who sees it" error={err.visibility}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {(["shared", "private"] as EntryVisibility[]).map((v) => {
                            const on = form.data.visibility === v;
                            return (
                                <button
                                    key={v}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => form.setData("visibility", v)}
                                    className={`flex items-center gap-2 rounded-[12px] border px-3 py-2.5 text-left text-[13px] font-bold ${
                                        on ? "border-primary bg-primary-container text-on-primary-container" : "border-outline-variant text-on-surface-variant hover:border-primary"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{v === "shared" ? "group" : "lock"}</span>
                                    {v === "shared" ? `Everyone at ${scopeLabel}` : "Only me"}
                                </button>
                            );
                        })}
                    </div>
                </SkField>

                <SkField label="Notes (optional)" error={err.notes}>
                    <textarea value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} rows={3} className={inputClass} maxLength={2000} />
                </SkField>
            </form>
        </SkSheet>
    );
}
