import { dayDate } from "@/utils/dates";
import type { ShiftView, WorkApp } from "@/types/work";
import { router } from "@inertiajs/react";
import React, { useState } from "react";
import { cardCls, DUTY_LABEL, ghostBtn, hm, inputCls, primaryBtn, SHIFT_CHIP, wr } from "./workUi";

/** My shifts for the next two weeks: accept, or ask the manager for a change. */
export default function MyShifts({ app, shifts }: { app: WorkApp; shifts: ShiftView[] }): React.ReactElement {
    const [asking, setAsking] = useState<number | null>(null);
    const [note, setNote] = useState("");

    if (shifts.length === 0) {
        return <p className={`${cardCls} text-[12px] text-on-surface-variant`}>No shifts in the next two weeks.</p>;
    }

    return (
        <section className={`${cardCls} divide-y divide-outline-variant/40 py-1`}>
            {shifts.map((shift) => (
                <div key={shift.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[13px] font-bold text-on-surface">
                                {dayDate(shift.date)} · {hm(shift.starts_at)}–{hm(shift.ends_at)}
                            </p>
                            <p className="text-[11px] text-on-surface-variant">
                                {shift.site?.name}
                                {shift.duty !== "none" ? ` · you ${DUTY_LABEL[shift.duty].toLowerCase()} the site` : ""}
                                {shift.change_note ? ` · you asked: “${shift.change_note}”` : ""}
                            </p>
                        </div>
                        <span className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${SHIFT_CHIP[shift.status].className}`}>
                            {SHIFT_CHIP[shift.status].label}
                        </span>
                    </div>

                    {asking === shift.id ? (
                        <div className="mt-2 flex gap-2">
                            <input className={inputCls} placeholder="What does not work?" value={note} onChange={(e) => setNote(e.target.value)} />
                            <button
                                type="button"
                                className={primaryBtn}
                                disabled={note.trim() === ""}
                                onClick={() =>
                                    router.post(wr(app, "work.shifts.change", shift.id), { note }, { preserveScroll: true, onSuccess: () => { setAsking(null); setNote(""); } })
                                }
                            >
                                Send
                            </button>
                        </div>
                    ) : (
                        <div className="mt-2 flex gap-2">
                            {shift.status === "published" || shift.status === "change_requested" ? (
                                <button type="button" className={primaryBtn} onClick={() => router.post(wr(app, "work.shifts.accept", shift.id), {}, { preserveScroll: true })}>
                                    Accept
                                </button>
                            ) : null}
                            {shift.status === "published" || shift.status === "accepted" ? (
                                <button type="button" className={ghostBtn} onClick={() => setAsking(shift.id)}>
                                    Ask for a change
                                </button>
                            ) : null}
                        </div>
                    )}
                </div>
            ))}
        </section>
    );
}
