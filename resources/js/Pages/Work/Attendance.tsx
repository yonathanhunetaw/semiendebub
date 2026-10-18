import { cardCls, clockTime, duration, FLAG_CHIP, ghostBtn, inputCls, primaryBtn, workLayout, wr } from "@/Components/Work/workUi";
import { dayDate } from "@/utils/dates";
import type { OvertimeDay, Person, TimeEntryView, WorkApp } from "@/types/work";
import { Head, Link, router } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Who clocked in and out at one site, a week at a time: who is in now, late
 * and early flags, the clock-ins the sweep had to close, and fixing them.
 */

interface Props {
    app: WorkApp;
    site: { id: number; name: string; kind_label: string };
    week: string;
    here?: TimeEntryView[];
    entries?: TimeEntryView[];
    people?: Person[];
    overtime?: OvertimeDay[];
    needsApproval?: boolean;
}

const hours = (minutes: number): string => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;

/** One person-day of overtime: its kinds, its pay hours, and the manager's yes or no. */
function OvertimeRow({ app, day }: { app: WorkApp; day: OvertimeDay }): React.ReactElement {
    const [note, setNote] = useState("");
    const kinds = [
        ["day", day.minutes.day],
        ["night", day.minutes.night],
        ["rest day", day.minutes.rest_day],
        ["holiday", day.minutes.holiday],
    ].filter(([, m]) => (m as number) > 0);
    const decide = (name: string) =>
        router.post(wr(app, name), { user_id: day.user_id, date: day.date, note: note || null }, { preserveScroll: true, onSuccess: () => setNote("") });

    return (
        <li className="py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-on-surface">
                        {day.name} · {dayDate(day.date)} · {hours(day.overtime)} overtime
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                        {kinds.map(([k, m]) => `${hours(m as number)} ${k}`).join(" · ")} · paid as {day.weighted_hours} h
                        {day.holiday ? ` · ${day.holiday}` : ""}
                        {day.decided_by ? ` · ${day.decided_by}${day.note ? `: “${day.note}”` : ""}` : ""}
                    </p>
                </div>
                <span
                    className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${
                        day.status === "approved" || day.status === "not_needed"
                            ? "border-success/30 bg-success-container/60 text-on-success-container"
                            : day.status === "rejected"
                              ? "border-error/30 bg-error-container/60 text-on-error-container"
                              : "border-warning/30 bg-warning-container/60 text-on-warning-container"
                    }`}
                >
                    {day.status === "pending" ? "To approve" : day.status === "not_needed" ? "Paid" : day.status === "approved" ? "Approved" : "Not paid"}
                </span>
            </div>
            {day.can_decide && day.status !== "not_needed" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="Note (needed to turn it down)" value={note} onChange={(e) => setNote(e.target.value)} />
                    {day.status !== "approved" ? (
                        <button type="button" className={primaryBtn} onClick={() => decide("work.overtime.approve")}>
                            Approve
                        </button>
                    ) : null}
                    {day.status !== "rejected" ? (
                        <button type="button" className={ghostBtn} disabled={note.trim() === ""} onClick={() => decide("work.overtime.reject")}>
                            Don’t pay
                        </button>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

/** An ISO instant → the value of a datetime-local input, in the browser's time. */
const local = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const addDays = (date: string, days: number): string => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

function EntryRow({ app, entry }: { app: WorkApp; entry: TimeEntryView }): React.ReactElement {
    const [fixing, setFixing] = useState(false);
    const [inAt, setInAt] = useState(local(entry.clock_in_at));
    const [outAt, setOutAt] = useState(local(entry.clock_out_at));
    const [note, setNote] = useState("");

    return (
        <li className="py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-on-surface">
                        {entry.user?.name} · {clockTime(entry.clock_in_at)}–{clockTime(entry.clock_out_at)}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                        {entry.worked_minutes !== null ? `${duration(entry.worked_minutes)} worked` : "still in"}
                        {entry.break_minutes > 0 ? ` · ${entry.break_minutes} min break` : ""}
                        {entry.on_break ? " · on a break" : ""}
                        {entry.shift ? ` · shift ${entry.shift.starts_at.slice(11, 16)}–${entry.shift.ends_at.slice(11, 16)}` : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {entry.flags.map((flag) => (
                        <span key={flag} className={`rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${FLAG_CHIP[flag].className}`}>
                            {FLAG_CHIP[flag].label}
                        </span>
                    ))}
                </div>
            </div>

            {fixing ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="datetime-local" className={inputCls} value={inAt} onChange={(e) => setInAt(e.target.value)} />
                    <input type="datetime-local" className={inputCls} value={outAt} onChange={(e) => setOutAt(e.target.value)} />
                    <input className={`${inputCls} col-span-2`} placeholder="Why (required)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="col-span-2 flex gap-2">
                        <button
                            type="button"
                            className={primaryBtn}
                            disabled={note.trim() === "" || !inAt}
                            onClick={() =>
                                router.put(
                                    wr(app, "work.time-entries.fix", entry.id),
                                    { clock_in_at: inAt, clock_out_at: outAt || null, note },
                                    { preserveScroll: true, onSuccess: () => setFixing(false) },
                                )
                            }
                        >
                            Save
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setFixing(false)}>
                            Back
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-1.5 flex gap-3">
                    <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setFixing(true)}>
                        Fix times
                    </button>
                    {entry.flags.includes("auto_closed") && !entry.reviewed ? (
                        <button
                            type="button"
                            className="text-[11px] font-bold text-primary"
                            onClick={() => router.post(wr(app, "work.time-entries.review", entry.id), {}, { preserveScroll: true })}
                        >
                            Times are right
                        </button>
                    ) : null}
                </div>
            )}
        </li>
    );
}

export default function Attendance({ app, site, week, here = [], entries = [], people = [], overtime = [], needsApproval = true }: Props): React.ReactElement {
    const [who, setWho] = useState("");
    const [note, setNote] = useState("");
    const go = (date: string) => router.get(wr(app, "work.attendance", { site: site.id, week: date }), {}, { preserveScroll: true });
    const dates = Array.from(new Set(entries.map((e) => local(e.clock_in_at).slice(0, 10))));
    const totals = entries.reduce<Record<string, { name: string; minutes: number }>>((acc, e) => {
        if (!e.user || e.worked_minutes === null) return acc;
        acc[e.user.id] = { name: e.user.name, minutes: (acc[e.user.id]?.minutes ?? 0) + e.worked_minutes };
        return acc;
    }, {});

    const [outFor, setOutFor] = useState<number | null>(null);
    const [outNote, setOutNote] = useState("");
    const clockOut = (entry: TimeEntryView) =>
        router.post(
            wr(app, "work.time-entries.clock-out", entry.id),
            { note: outNote },
            { preserveScroll: true, onSuccess: () => { setOutFor(null); setOutNote(""); } },
        );

    return (
        <>
            <Head title={`Attendance · ${site.name}`} />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <Link href={wr(app, "work.sites.show", site.id)} className="material-symbols-outlined text-on-surface-variant">
                        arrow_back
                    </Link>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-lg font-bold tracking-tight text-on-surface">Attendance · {site.name}</h1>
                        <p className="text-[11px] text-outline">Week of {dayDate(week)}</p>
                    </div>
                    <button type="button" className="material-symbols-outlined text-on-surface-variant" onClick={() => go(addDays(week, -7))} aria-label="Previous week">
                        chevron_left
                    </button>
                    <button type="button" className="material-symbols-outlined text-on-surface-variant" onClick={() => go(addDays(week, 7))} aria-label="Next week">
                        chevron_right
                    </button>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3">
                    <section className={cardCls}>
                        <h2 className="text-[13px] font-bold text-on-surface">In now</h2>
                        {here.length === 0 ? <p className="mt-1 text-[12px] text-on-surface-variant">Nobody is clocked in.</p> : null}
                        <ul className="mt-1 divide-y divide-outline-variant/40">
                            {here.map((entry) => (
                                <li key={entry.id} className="py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] text-on-surface">
                                            {entry.user?.name} · since {clockTime(entry.clock_in_at)}
                                        </span>
                                        <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setOutFor(outFor === entry.id ? null : entry.id)}>
                                            Clock out
                                        </button>
                                    </div>
                                    {outFor === entry.id ? (
                                        <div className="mt-2 flex gap-2">
                                            <input
                                                className={inputCls}
                                                placeholder="Why by hand? (required)"
                                                value={outNote}
                                                onChange={(e) => setOutNote(e.target.value)}
                                            />
                                            <button type="button" className={primaryBtn} disabled={outNote.trim() === ""} onClick={() => clockOut(entry)}>
                                                Clock out
                                            </button>
                                        </div>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                            <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>
                                <option value="">Clock someone in…</option>
                                {people.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className={ghostBtn}
                                disabled={!who || note.trim() === ""}
                                onClick={() =>
                                    router.post(
                                        wr(app, "work.attendance.clock-in", site.id),
                                        { user_id: Number(who), note },
                                        { preserveScroll: true, onSuccess: () => { setWho(""); setNote(""); } },
                                    )
                                }
                            >
                                Clock in
                            </button>
                            {who ? (
                                <input
                                    className={`${inputCls} col-span-2`}
                                    placeholder="Why by hand? (phone dead, no counter screen…)"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            ) : null}
                        </div>
                    </section>

                    {Object.keys(totals).length > 0 ? (
                        <section className={cardCls}>
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-[13px] font-bold text-on-surface">Hours worked this week</h2>
                                <span className="flex gap-3">
                                    <a href={wr(app, "work.hours.site", { site: site.id, from: week, to: addDays(week, 6) })} className="text-[11px] font-bold text-primary">
                                        Download (CSV)
                                    </a>
                                    <a href={wr(app, "work.hours.site", { site: site.id, from: week, to: addDays(week, 6), detail: 1 })} className="text-[11px] font-bold text-primary">
                                        Every clock-in
                                    </a>
                                </span>
                            </div>
                            <ul className="mt-1 space-y-0.5">
                                {Object.entries(totals).map(([id, t]) => (
                                    <li key={id} className="flex justify-between text-[12px] text-on-surface">
                                        <span>{t.name}</span>
                                        <span className="font-semibold">{duration(t.minutes)}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {overtime.length > 0 ? (
                        <section className={cardCls}>
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-[13px] font-bold text-on-surface">Overtime this week</h2>
                                <Link href={wr(app, "work.overtime")} className="text-[11px] font-bold text-primary">
                                    Rules
                                </Link>
                            </div>
                            {!needsApproval ? <p className="text-[11px] text-on-surface-variant">Overtime is paid without approval (see the rules).</p> : null}
                            <ul className="divide-y divide-outline-variant/40">
                                {overtime.map((day) => (
                                    <OvertimeRow key={`${day.user_id}-${day.date}`} app={app} day={day} />
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {dates.length === 0 ? <p className={`${cardCls} text-[12px] text-on-surface-variant`}>Nobody clocked in this week.</p> : null}

                    {dates.map((date) => (
                        <section key={date} className={cardCls}>
                            <h2 className="text-[13px] font-bold text-on-surface">{dayDate(date)}</h2>
                            <ul className="divide-y divide-outline-variant/40">
                                {entries
                                    .filter((e) => local(e.clock_in_at).slice(0, 10) === date)
                                    .map((entry) => (
                                        <EntryRow key={entry.id} app={app} entry={entry} />
                                    ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </>
    );
}

Attendance.layout = workLayout;
