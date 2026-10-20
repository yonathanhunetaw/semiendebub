import { cardCls, DUTY_LABEL, ghostBtn, hm, inputCls, LEAVE_LABEL, primaryBtn, ROLE_LABEL, SHIFT_CHIP, WEEKDAYS, workLayout, wr } from "@/Components/Work/workUi";
import { dayDate } from "@/utils/dates";
import type { CoverageGap, DayHours, LeaveView, ShiftDuty, ShiftView, StaffingRuleRow, WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import { calendarPrefill } from "@/Components/Calendar/calendarPrefill";
import React, { useState } from "react";

/**
 * The rota of one site, a week at a time. The manager drafts shifts and
 * publishes the week; each person accepts theirs, or asks for a change.
 * A shift may carry the opening or closing duty. Gaps against the staffing
 * rules show at the top.
 */

interface Props {
    app: WorkApp;
    site: { id: number; name: string; kind_label: string };
    /** Monday of the week shown. */
    week: string;
    days?: { date: string; hours: DayHours | null }[];
    people?: { id: number; name: string; role: string }[];
    shifts?: ShiftView[];
    gaps?: CoverageGap[];
    rules?: StaffingRuleRow[];
    /** Approved leave of this site's people this week. */
    leave?: LeaveView[];
}

const addDays = (date: string, days: number): string => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

interface Draft {
    id: number | null;
    date: string;
    user_id: string;
    starts: string;
    ends: string;
    duty: ShiftDuty;
}

function ShiftForm({ app, siteId, draft, people, onDone }: { app: WorkApp; siteId: number; draft: Draft; people: Props["people"]; onDone: () => void }): React.ReactElement {
    const [form, setForm] = useState<Draft>(draft);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const save = () => {
        setBusy(true);
        setProblem(null);
        const data = { user_id: Number(form.user_id), starts_at: `${form.date}T${form.starts}`, ends_at: `${form.date}T${form.ends}`, duty: form.duty };
        const options = {
            preserveScroll: true,
            onFinish: () => setBusy(false),
            // The service refuses with a flash error (a clash, leave…): keep the form open and say why.
            onSuccess: (page: { props: unknown }) => {
                const error = (page.props as { flash?: { error?: string | null } }).flash?.error;
                if (error) setProblem(error);
                else onDone();
            },
            onError: (errors: Record<string, string>) => setProblem(Object.values(errors)[0] ?? "Check the times."),
        };
        if (form.id === null) router.post(wr(app, "work.shifts.store", siteId), data, options);
        else router.put(wr(app, "work.shifts.update", form.id), data, options);
    };

    return (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-[12px] border border-primary/30 bg-primary-container/20 p-2.5">
            <select className={`${inputCls} col-span-2`} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Who…</option>
                {(people ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                ))}
            </select>
            <input type="time" className={inputCls} value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} />
            <input type="time" className={inputCls} value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} />
            <select className={`${inputCls} col-span-2`} value={form.duty} onChange={(e) => setForm({ ...form, duty: e.target.value as ShiftDuty })}>
                <option value="none">No opening / closing duty</option>
                <option value="opener">Opens the site</option>
                <option value="closer">Closes the site</option>
            </select>
            {problem ? <p className="col-span-2 text-[11px] text-error">{problem}</p> : null}
            <div className="col-span-2 flex gap-2">
                <button type="button" className={primaryBtn} disabled={busy || !form.user_id || !form.starts || !form.ends} onClick={save}>
                    {form.id === null ? "Add shift" : "Save"}
                </button>
                <button type="button" className={ghostBtn} onClick={onDone}>
                    Back
                </button>
            </div>
        </div>
    );
}

function RulesForm({ app, siteId, rules }: { app: WorkApp; siteId: number; rules: StaffingRuleRow[] }): React.ReactElement {
    const form = useForm<{ rules: StaffingRuleRow[] }>({ rules });
    const set = (i: number, patch: Partial<StaffingRuleRow>) =>
        form.setData(
            "rules",
            form.data.rules.map((rule, j) => (j === i ? { ...rule, ...patch } : rule)),
        );

    return (
        <form
            className={cardCls}
            onSubmit={(e) => {
                e.preventDefault();
                form.put(wr(app, "work.staffing-rules", siteId), { preserveScroll: true });
            }}
        >
            <h2 className="text-[13px] font-bold text-on-surface">How many at a time</h2>
            <p className="text-[11px] text-on-surface-variant">“At least 2 sellers from 10:00 to 14:00 on weekdays.” The rota shows where it falls short.</p>

            {form.data.rules.map((rule, i) => (
                <div key={i} className="mt-3 space-y-2 rounded-[12px] border border-outline-variant/60 p-2.5">
                    <div className="flex flex-wrap gap-1">
                        {WEEKDAYS.map((name, d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => set(i, { weekdays: rule.weekdays.includes(d) ? rule.weekdays.filter((x) => x !== d) : [...rule.weekdays, d] })}
                                className={`rounded-[999px] border px-2 py-0.5 text-[11px] font-bold ${rule.weekdays.includes(d) ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"}`}
                            >
                                {name.slice(0, 3)}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-[64px_1fr] items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            max={20}
                            className={inputCls}
                            value={rule.min_people}
                            onChange={(e) => set(i, { min_people: Number(e.target.value) })}
                        />
                        <select className={inputCls} value={rule.role} onChange={(e) => set(i, { role: e.target.value as StaffingRuleRow["role"] })}>
                            <option value="seller">sellers at least</option>
                            <option value="stock_keeper">stock keepers at least</option>
                            <option value="any">people at least</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="time" className={inputCls} value={rule.starts_at} onChange={(e) => set(i, { starts_at: e.target.value })} />
                        <span className="text-[11px] text-outline">to</span>
                        <input type="time" className={inputCls} value={rule.ends_at} onChange={(e) => set(i, { ends_at: e.target.value })} />
                        <button
                            type="button"
                            className="material-symbols-outlined text-error"
                            onClick={() => form.setData("rules", form.data.rules.filter((_, j) => j !== i))}
                            aria-label="Remove rule"
                        >
                            delete
                        </button>
                    </div>
                </div>
            ))}

            {Object.values(form.errors).map((message) => (
                <p key={message} className="mt-1 text-[11px] text-error">
                    {message}
                </p>
            ))}

            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => form.setData("rules", [...form.data.rules, { weekdays: [1, 2, 3, 4, 5, 6], starts_at: "09:00", ends_at: "18:00", role: "seller", min_people: 1 }])}
                >
                    Add rule
                </button>
                <button type="submit" className={primaryBtn} disabled={form.processing}>
                    Save rules
                </button>
            </div>
        </form>
    );
}

export default function Rota({ app, site, week, days = [], people = [], shifts = [], gaps = [], rules = [], leave = [] }: Props): React.ReactElement {
    // Started from a day on the calendar: open a new shift on that day.
    const [editing, setEditing] = useState<Draft | null>(() => {
        const prefill = calendarPrefill();
        const day = prefill.open ? days.find((d) => d.date === prefill.date) : undefined;
        if (!day) return null;

        return { id: null, date: day.date, user_id: "", starts: prefill.time ?? day.hours?.opens_at ?? "08:30", ends: day.hours?.closes_at ?? "17:00", duty: "none" };
    });
    const drafts = shifts.filter((s) => s.status === "draft").length;
    const go = (date: string) => router.get(wr(app, "work.rota", { site: site.id, week: date }), {}, { preserveScroll: true });

    const startEdit = (date: string, hours: DayHours | null, shift?: ShiftView) =>
        setEditing(
            shift
                ? { id: shift.id, date, user_id: String(shift.user?.id ?? ""), starts: hm(shift.starts_at), ends: hm(shift.ends_at), duty: shift.duty }
                : { id: null, date, user_id: "", starts: hours?.opens_at ?? "08:30", ends: hours?.closes_at ?? "17:00", duty: "none" },
        );

    return (
        <>
            <Head title={`Rota · ${site.name}`} />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Link href={wr(app, "work.sites.show", site.id)} className="material-symbols-outlined text-on-surface-variant">
                            arrow_back
                        </Link>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-lg font-bold tracking-tight text-on-surface">Rota · {site.name}</h1>
                            <p className="text-[11px] text-outline">Week of {dayDate(week)}</p>
                        </div>
                        <button type="button" className="material-symbols-outlined text-on-surface-variant" onClick={() => go(addDays(week, -7))} aria-label="Previous week">
                            chevron_left
                        </button>
                        <button type="button" className="material-symbols-outlined text-on-surface-variant" onClick={() => go(addDays(week, 7))} aria-label="Next week">
                            chevron_right
                        </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            className={primaryBtn}
                            disabled={drafts === 0}
                            onClick={() => router.post(wr(app, "work.rota.publish", site.id), { week }, { preserveScroll: true })}
                        >
                            Publish {drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"}` : "week"}
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => router.post(wr(app, "work.rota.copy", site.id), { week }, { preserveScroll: true })}>
                            Copy last week
                        </button>
                    </div>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3">
                    {gaps.length > 0 ? (
                        <section className="rounded-[16px] border border-warning/40 bg-warning-container/50 p-3.5">
                            <h2 className="text-[13px] font-bold text-on-warning-container">Short of staff</h2>
                            <ul className="mt-1 space-y-0.5">
                                {gaps.map((gap, i) => (
                                    <li key={i} className="text-[12px] text-on-warning-container">
                                        {dayDate(gap.date)} {gap.from}–{gap.to}: {gap.have} of {gap.need} {ROLE_LABEL[gap.role]}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {days.map(({ date, hours }) => {
                        const dayShifts = shifts.filter((s) => s.date === date);
                        const away = leave.filter((l) => l.starts_on <= date && l.ends_on >= date);
                        const closed = hours?.closed ?? false;

                        return (
                            <section key={date} className={cardCls} data-date={date}>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[13px] font-bold text-on-surface">
                                        {WEEKDAYS[new Date(`${date}T12:00:00`).getDay()]} <span className="font-normal text-on-surface-variant">{dayDate(date)}</span>
                                    </p>
                                    <span className="text-[11px] text-on-surface-variant">
                                        {hours === null ? "Hours not set" : closed ? "Closed" : `${hours.opens_at}–${hours.closes_at}`}
                                    </span>
                                </div>

                                {away.length > 0 ? (
                                    <p className="mt-1 text-[11px] text-on-surface-variant">
                                        On leave: {away.map((l) => `${l.user?.name} (${LEAVE_LABEL[l.type].toLowerCase()})`).join(", ")}
                                    </p>
                                ) : null}

                                <ul className="mt-2 divide-y divide-outline-variant/40">
                                    {dayShifts.map((shift) =>
                                        editing?.id === shift.id ? (
                                            <li key={shift.id}>
                                                <ShiftForm app={app} siteId={site.id} draft={editing} people={people} onDone={() => setEditing(null)} />
                                            </li>
                                        ) : (
                                            <li key={shift.id} className="flex items-center gap-2 py-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[12px] font-semibold text-on-surface">
                                                        {shift.user?.name} · {hm(shift.starts_at)}–{hm(shift.ends_at)}
                                                        {shift.duty !== "none" ? <span className="text-primary"> · {DUTY_LABEL[shift.duty]}</span> : null}
                                                    </p>
                                                    {shift.change_note ? <p className="text-[11px] text-on-warning-container">“{shift.change_note}”</p> : null}
                                                </div>
                                                <span className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${SHIFT_CHIP[shift.status].className}`}>
                                                    {SHIFT_CHIP[shift.status].label}
                                                </span>
                                                <button type="button" className="material-symbols-outlined text-[20px] text-on-surface-variant" onClick={() => startEdit(date, hours, shift)} aria-label="Edit shift">
                                                    edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="material-symbols-outlined text-[20px] text-error"
                                                    onClick={() => router.post(wr(app, "work.shifts.cancel", shift.id), {}, { preserveScroll: true })}
                                                    aria-label="Cancel shift"
                                                >
                                                    close
                                                </button>
                                            </li>
                                        ),
                                    )}
                                </ul>

                                {editing?.id === null && editing.date === date ? (
                                    <ShiftForm app={app} siteId={site.id} draft={editing} people={people} onDone={() => setEditing(null)} />
                                ) : !closed ? (
                                    <button type="button" className="mt-2 text-[12px] font-bold text-primary" onClick={() => startEdit(date, hours)}>
                                        + Add shift
                                    </button>
                                ) : null}
                            </section>
                        );
                    })}

                    <RulesForm app={app} siteId={site.id} rules={rules} />
                </div>
            </div>
        </>
    );
}

Rota.layout = workLayout;
