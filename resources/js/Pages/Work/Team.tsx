import { cardCls, Chip, DUTY_LABEL, ghostBtn, hm, inputCls, LEAVE_LABEL, primaryBtn, sectionTitle, workLayout, wr } from "@/Components/Work/workUi";
import { dayDate } from "@/utils/dates";
import type { LeaveView, Person, SwapView, WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * The team, for managers: leave and shift swaps waiting on you, leave coming
 * up in the next 30 days, and recording leave already agreed (someone called
 * in sick). Approving leave cancels the person's shifts on those days.
 */

/** Someone said they can't do their duty on a day ahead (SiteDayService::cantDo). */
interface CantDo {
    id: number;
    duty: "opener" | "closer" | "driver";
    note: string | null;
    who: string | null;
    date: string;
    site: { id: number; name: string };
}

const DUTY_VERB: Record<CantDo["duty"], string> = { opener: "open", closer: "close", driver: "drive for" };

interface Props {
    app: WorkApp;
    /** "I can't" answers in the week ahead: pick someone else on the Rota. */
    cantDo?: CantDo[];
    leave?: LeaveView[];
    swaps?: SwapView[];
    upcoming?: LeaveView[];
    people?: Person[];
    types?: string[];
}

const range = (row: LeaveView): string =>
    `${dayDate(row.starts_on)}${row.ends_on !== row.starts_on ? ` – ${dayDate(row.ends_on)}` : ""} (${row.days} day${row.days === 1 ? "" : "s"})`;

function Decide({ onYes, onNo, noNeedsNote }: { onYes: (note: string) => void; onNo: (note: string) => void; noNeedsNote: boolean }): React.ReactElement {
    const [note, setNote] = useState("");

    return (
        <div className="mt-2 flex flex-wrap gap-2">
            <input className={`${inputCls} flex-1`} placeholder={noNeedsNote ? "Note (needed to turn it down)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className={primaryBtn} onClick={() => onYes(note)}>
                Approve
            </button>
            <button type="button" className={ghostBtn} disabled={noNeedsNote && note.trim() === ""} onClick={() => onNo(note)}>
                Turn down
            </button>
        </div>
    );
}

export default function Team({ app, leave = [], swaps = [], upcoming = [], people = [], types = [], cantDo = [] }: Props): React.ReactElement {
    const record = useForm({ user_id: "", type: "sick", starts_on: "", ends_on: "", note: "" });
    const post = (name: string, id: number, note: string) => router.post(wr(app, name, id), { note: note || null }, { preserveScroll: true });

    return (
        <>
            <Head title="Team" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <Link href={wr(app, "work")} className="material-symbols-outlined text-on-surface-variant">
                        arrow_back
                    </Link>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-on-surface">Team</h1>
                        <p className="text-[11px] text-outline">Leave and shift swaps for the sites you manage.</p>
                    </div>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3">
                    {cantDo.length > 0 ? (
                        <>
                            <h2 className={sectionTitle}>Said they can’t: pick someone else</h2>
                            {cantDo.map((row) => (
                                <section key={row.id} className={`${cardCls} border-error/40`}>
                                    <p className="text-[13px] font-bold text-on-surface">
                                        {row.who ?? "Someone"} can’t {DUTY_VERB[row.duty]} {row.site.name}
                                    </p>
                                    <p className="text-[11px] text-on-surface-variant">
                                        {dayDate(row.date)}
                                        {row.note ? ` · “${row.note}”` : ""}
                                    </p>
                                    <Link href={wr(app, "work.rota", { site: row.site.id, week: row.date })} className={`mt-2 inline-block ${primaryBtn}`}>
                                        Plan that day
                                    </Link>
                                </section>
                            ))}
                        </>
                    ) : null}
                    <h2 className={sectionTitle}>Leave to decide</h2>
                    {leave.length === 0 ? <p className={`${cardCls} text-[12px] text-on-surface-variant`}>Nothing waiting.</p> : null}
                    {leave.map((row) => (
                        <section key={row.id} className={cardCls}>
                            <p className="text-[13px] font-bold text-on-surface">
                                {row.user?.name} · {LEAVE_LABEL[row.type]}
                            </p>
                            <p className="text-[12px] text-on-surface-variant">
                                {range(row)}
                                {row.note ? ` · “${row.note}”` : ""}
                            </p>
                            <Decide
                                noNeedsNote
                                onYes={(note) => post("work.leave.approve", row.id, note)}
                                onNo={(note) => post("work.leave.reject", row.id, note)}
                            />
                        </section>
                    ))}

                    <h2 className={sectionTitle}>Swaps to approve</h2>
                    {swaps.length === 0 ? <p className={`${cardCls} text-[12px] text-on-surface-variant`}>Nothing waiting.</p> : null}
                    {swaps.map((swap) => (
                        <section key={swap.id} className={cardCls}>
                            <p className="text-[13px] font-bold text-on-surface">
                                {swap.from?.name} → {swap.to?.name}
                            </p>
                            {swap.shift ? (
                                <p className="text-[12px] text-on-surface-variant">
                                    {dayDate(swap.shift.date)} · {hm(swap.shift.starts_at)}–{hm(swap.shift.ends_at)} at {swap.shift.site?.name}
                                    {swap.shift.duty !== "none" ? ` · ${DUTY_LABEL[swap.shift.duty].toLowerCase()} the site` : ""}
                                    {swap.note ? ` · “${swap.note}”` : ""}
                                </p>
                            ) : null}
                            <Decide noNeedsNote={false} onYes={() => post("work.swaps.approve", swap.id, "")} onNo={(note) => post("work.swaps.reject", swap.id, note)} />
                        </section>
                    ))}

                    <h2 className={sectionTitle}>Record leave</h2>
                    <form
                        className={`${cardCls} grid grid-cols-2 gap-2`}
                        onSubmit={(e) => {
                            e.preventDefault();
                            record.post(wr(app, "work.leave.record"), { preserveScroll: true, onSuccess: () => record.reset() });
                        }}
                    >
                        <p className="col-span-2 text-[11px] text-on-surface-variant">Already agreed (someone called in sick): approved at once, their shifts on those days cancelled.</p>
                        <select className={inputCls} value={record.data.user_id} onChange={(e) => record.setData("user_id", e.target.value)} required>
                            <option value="">Who…</option>
                            {people.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <select className={inputCls} value={record.data.type} onChange={(e) => record.setData("type", e.target.value)}>
                            {types.map((t) => (
                                <option key={t} value={t}>
                                    {LEAVE_LABEL[t] ?? t}
                                </option>
                            ))}
                        </select>
                        <input type="date" className={inputCls} value={record.data.starts_on} onChange={(e) => record.setData("starts_on", e.target.value)} required />
                        <input type="date" className={inputCls} value={record.data.ends_on} onChange={(e) => record.setData("ends_on", e.target.value)} required />
                        <input className={`${inputCls} col-span-2`} placeholder="Note (optional)" value={record.data.note} onChange={(e) => record.setData("note", e.target.value)} />
                        {Object.values(record.errors).map((m) => (
                            <p key={m} className="col-span-2 text-[11px] text-error">
                                {m}
                            </p>
                        ))}
                        <button type="submit" className={`col-span-2 ${primaryBtn}`} disabled={record.processing}>
                            Record
                        </button>
                    </form>

                    <h2 className={sectionTitle}>Leave in the next 30 days</h2>
                    <section className={cardCls}>
                        {upcoming.length === 0 ? <p className="text-[12px] text-on-surface-variant">Nobody is on leave.</p> : null}
                        <ul className="divide-y divide-outline-variant/40">
                            {upcoming.map((row) => (
                                <li key={row.id} className="flex items-center justify-between gap-2 py-2">
                                    <span className="text-[12px] text-on-surface">
                                        <span className="font-semibold">{row.user?.name}</span> · {LEAVE_LABEL[row.type]} · {range(row)}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <Chip status={row.status} />
                                        <button
                                            type="button"
                                            className="text-[11px] font-bold text-error"
                                            onClick={() => router.post(wr(app, "work.leave.cancel", row.id), {}, { preserveScroll: true })}
                                        >
                                            Cancel
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </>
    );
}

Team.layout = workLayout;
