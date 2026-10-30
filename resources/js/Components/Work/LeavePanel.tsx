import { dayDate, shopToday } from "@/utils/dates";
import { calendarPrefill } from "@/Components/Calendar/calendarPrefill";
import type { LeaveView, WorkApp } from "@/types/work";
import { router, useForm } from "@inertiajs/react";
import React, { useState } from "react";
import { cardCls, Chip, ghostBtn, inputCls, LEAVE_LABEL, primaryBtn, wr } from "./workUi";

/** My leave: ask for days off, see what was decided, cancel. */
export default function LeavePanel({ app, leave, types }: { app: WorkApp; leave: LeaveView[]; types: string[] }): React.ReactElement {
    // Started from a day on the calendar: open the form on that day.
    const [prefill] = useState(calendarPrefill);
    const [open, setOpen] = useState(prefill.open);
    const panelRef = React.useRef<HTMLElement>(null);
    const form = useForm({ type: "annual", starts_on: prefill.date ?? "", ends_on: prefill.date ?? "", note: "" });

    React.useEffect(() => {
        if (prefill.open) panelRef.current?.scrollIntoView({ block: "center" });
    }, [prefill.open]);

    return (
        <section ref={panelRef} className={cardCls}>
            {leave.length === 0 && !open ? <p className="text-[12px] text-on-surface-variant">No leave asked for.</p> : null}
            <ul className="divide-y divide-outline-variant/40">
                {leave.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-2 py-2">
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-on-surface">
                                {LEAVE_LABEL[row.type]} · {dayDate(row.starts_on)}
                                {row.ends_on !== row.starts_on ? ` – ${dayDate(row.ends_on)}` : ""} ({row.days} day{row.days === 1 ? "" : "s"})
                            </p>
                            {row.decision_note || row.note ? (
                                <p className="text-[11px] text-on-surface-variant">{row.decision_note ? `${row.decided_by}: ${row.decision_note}` : row.note}</p>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <Chip status={row.status} />
                            {row.status === "requested" || (row.status === "approved" && row.starts_on > shopToday()) ? (
                                <button
                                    type="button"
                                    className="text-[11px] font-bold text-error"
                                    onClick={() => router.post(wr(app, "work.leave.cancel", row.id), {}, { preserveScroll: true })}
                                >
                                    Cancel
                                </button>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ul>

            {open ? (
                <form
                    className="mt-2 grid grid-cols-2 gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post(wr(app, "work.leave.store"), { preserveScroll: true, onSuccess: () => { form.reset(); setOpen(false); } });
                    }}
                >
                    <select className={`${inputCls} col-span-2`} value={form.data.type} onChange={(e) => form.setData("type", e.target.value)}>
                        {types.map((t) => (
                            <option key={t} value={t}>
                                {LEAVE_LABEL[t] ?? t}
                            </option>
                        ))}
                    </select>
                    <input type="date" className={inputCls} value={form.data.starts_on} onChange={(e) => form.setData("starts_on", e.target.value)} required />
                    <input type="date" className={inputCls} value={form.data.ends_on} onChange={(e) => form.setData("ends_on", e.target.value)} required />
                    <input className={`${inputCls} col-span-2`} placeholder="Note (optional)" value={form.data.note} onChange={(e) => form.setData("note", e.target.value)} />
                    {Object.values(form.errors).map((m) => (
                        <p key={m} className="col-span-2 text-[11px] text-error">
                            {m}
                        </p>
                    ))}
                    <div className="col-span-2 flex gap-2">
                        <button type="submit" className={primaryBtn} disabled={form.processing}>
                            Ask
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setOpen(false)}>
                            Back
                        </button>
                    </div>
                </form>
            ) : (
                <button type="button" className={`mt-2 ${ghostBtn}`} onClick={() => setOpen(true)}>
                    Ask for leave
                </button>
            )}
        </section>
    );
}
