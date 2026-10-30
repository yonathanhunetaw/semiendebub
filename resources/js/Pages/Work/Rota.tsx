import { cardCls, ghostBtn, hm, inputCls, LEAVE_LABEL, primaryBtn, ROLE_LABEL, SHIFT_CHIP, WEEKDAYS, workLayout, wr } from "@/Components/Work/workUi";
import { dayDate, shopToday } from "@/utils/dates";
import type { CoverageGap, DayHours, LeaveView, Person, ShiftView, SiteDayView, StaffingRuleRow, WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import { calendarPrefill } from "@/Components/Calendar/calendarPrefill";
import React, { useState } from "react";

/**
 * Shifts and opening of one site, a week at a time: the one place a manager
 * plans each day. Per day: who opens, who closes and who drives (the driver
 * brings the opener in and takes the closer home; those rides are made from
 * it), then the shifts. The manager drafts shifts and publishes the week;
 * each person accepts theirs, or asks for a change. Gaps against the staffing
 * rules show at the top. A Main Hub has no shifts: only who opens, closes, drives.
 */

interface Props {
    app: WorkApp;
    site: { id: number; name: string; kind_label: string; has_shifts: boolean };
    /** Monday of the week shown. */
    week: string;
    /** Each day's hours and plan (null for a past day nothing happened on). */
    days?: { date: string; hours: DayHours | null; plan: (SiteDayView & { editable: boolean }) | null }[];
    /** People who drive (users marked as drivers). */
    drivers?: Person[];
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
    // The local date, not toISOString (UTC), which moves a day for browsers far from UTC.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Draft {
    id: number | null;
    date: string;
    user_id: string;
    starts: string;
    ends: string;
}

function ShiftForm({ app, siteId, draft, people, onDone }: { app: WorkApp; siteId: number; draft: Draft; people: Props["people"]; onDone: () => void }): React.ReactElement {
    const [form, setForm] = useState<Draft>(draft);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const save = () => {
        setBusy(true);
        setProblem(null);
        const data = { user_id: Number(form.user_id), starts_at: `${form.date}T${form.starts}`, ends_at: `${form.date}T${form.ends}` };
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
            <select className={`${inputCls} col-span-2`} aria-label="Who works this shift" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Who…</option>
                {(people ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                ))}
            </select>
            <input type="time" className={inputCls} value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} />
            <input type="time" className={inputCls} value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} />
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

/** Shown after a name in the pickers: several people can share a first name. */
const ROLE_NAME: Record<string, string> = { admin: "admin", seller: "seller", store_manager: "store manager", stock_keeper: "stock keeper", delivery: "driver" };

/** Who opens, closes and drives that day: saved on its own, at once. */
function DayPlan({ app, siteId, date, plan, people, drivers }: { app: WorkApp; siteId: number; date: string; plan: SiteDayView & { editable: boolean }; people: Props["people"]; drivers: Person[] }): React.ReactElement {
    type Field = "opener_id" | "closer_id" | "driver_id";
    // The day's own copy: a second change made before the first save returns must not send stale names.
    const [chosen, setChosen] = useState<Record<Field, number | null>>({ opener_id: plan.opener?.id ?? null, closer_id: plan.closer?.id ?? null, driver_id: plan.driver?.id ?? null });
    const [saving, setSaving] = useState(false);
    const save = (field: Field, value: number | null) => {
        const next = { ...chosen, [field]: value };
        setChosen(next);
        setSaving(true);
        router.put(wr(app, "work.sites.plan", siteId), { days: [{ date, ...next }] }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };
    const pick = (label: string, field: Field, options: Person[], none: string) => (
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
            {label}
            <select
                className={`${inputCls} mt-0.5 normal-case tracking-normal ${field === "driver_id" && chosen.driver_id === null ? "border-warning" : ""}`}
                aria-label={`${label} ${date}`}
                value={chosen[field] ?? ""}
                disabled={!plan.editable || saving}
                onChange={(e) => save(field, e.target.value ? Number(e.target.value) : null)}
            >
                <option value="">{none}</option>
                {options.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                        {"role" in p && typeof p.role === "string" ? ` · ${ROLE_NAME[p.role] ?? p.role}` : ""}
                    </option>
                ))}
            </select>
        </label>
    );

    return (
        <div className="mt-2 rounded-[12px] border border-outline-variant/60 bg-surface-container-low p-2">
            <div className="grid grid-cols-3 gap-2">
                {pick("Opens", "opener_id", people ?? [], "Nobody yet")}
                {pick("Closes", "closer_id", people ?? [], "Nobody yet")}
                {pick("Drives", "driver_id", drivers, "No driver")}
            </div>
            <p className="mt-1.5 text-[11px] text-on-surface-variant">
                {plan.driver
                    ? plan.rides.length > 0
                        ? plan.rides.map((ride) => `${ride.purpose === "opening" ? "Picks up the opener" : "Takes the closer home"} ${hm(ride.departs_at)}`).join(" · ")
                        : "The driver's rides appear once the opener or closer is named."
                    : "No driver: the opener comes on their own and the closer goes home on their own. Opening and closing go ahead, flagged."}
            </p>
            {/* Will they do it: what each named person answered in My work. */}
            {(["opener", "closer", "driver"] as const).some((duty) => plan[duty]) ? (
                <ul className="mt-1.5 space-y-0.5 text-[11px]">
                    {(["opener", "closer", "driver"] as const).map((duty) => {
                        const person = plan[duty];
                        const answer = plan.answers?.[duty] ?? null;
                        if (!person) return null;
                        const job = duty === "opener" ? "opens" : duty === "closer" ? "closes" : "drives";

                        return (
                            <li
                                key={duty}
                                className={answer?.answer === "yes" ? "text-on-success-container" : answer?.answer === "no" ? "font-semibold text-on-error-container" : "text-on-surface-variant"}
                            >
                                {answer?.answer === "yes"
                                    ? `✓ ${person.name} ${job}: said yes`
                                    : answer?.answer === "no"
                                      ? `✗ ${person.name} can’t ${job.slice(0, -1)}: “${answer.note ?? ""}”. Pick someone else.`
                                      : `${person.name} ${job}: not answered yet`}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            {plan.opener && plan.editable && plan.status !== "open" ? (
                <p className={`mt-1 text-[11px] ${plan.key_holder?.id === plan.opener.id ? "text-on-surface-variant" : "font-semibold text-on-warning-container"}`}>
                    {plan.key_holder?.id === plan.opener.id
                        ? `${plan.opener.name} holds the key.`
                        : plan.key_holder
                          ? `The key is with ${plan.key_holder.name}: they hand it to ${plan.opener.name} before opening.`
                          : `Nobody holds the key yet: give it to ${plan.opener.name} on My work → Keys.`}
                </p>
            ) : null}
            {plan.opener || plan.closer || plan.driver ? (
                <p className="mt-1 text-[11px] text-on-surface-variant">Each of them sees their part as steps on My work → Today (and in the week before, under Shifts).</p>
            ) : null}
        </div>
    );
}

/**
 * The week at a glance: one row per person, one column per day, each cell the
 * shift's times (dashed while a draft, marked until accepted), who opens (O)
 * and closes (C), and leave. Tapping a day goes to its card below.
 */
function WeekGlance({ days, shifts, leave }: { days: NonNullable<Props["days"]>; shifts: ShiftView[]; leave: LeaveView[] }): React.ReactElement | null {
    const people = Array.from(new Map(shifts.filter((s) => s.user).map((s) => [s.user!.id, s.user!.name])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
    if (people.length === 0) return null;
    const today = shopToday();
    const jump = (date: string) => document.querySelector(`section[data-date="${date}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

    return (
        <section className={cardCls}>
            <h2 className="text-[13px] font-bold text-on-surface">The week at a glance</h2>
            {/* Scrolls inside the card on a phone; the page itself never scrolls sideways. */}
            <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-[10px]">
                    <thead>
                        <tr>
                            <th className="w-[96px]" />
                            {days.map(({ date, hours }) => (
                                <th key={date} className="p-0">
                                    <button
                                        type="button"
                                        onClick={() => jump(date)}
                                        className={`w-full rounded-[8px] px-1 py-1 font-bold ${date === today ? "bg-primary text-on-primary" : "text-on-surface"} ${hours?.closed ? "opacity-50" : ""}`}
                                    >
                                        {WEEKDAYS[new Date(`${date}T12:00:00`).getDay()].slice(0, 3)} {Number(date.slice(8, 10))}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {people.map(([id, name]) => (
                            <tr key={id}>
                                <th scope="row" className="truncate pr-1 text-left text-[11px] font-semibold text-on-surface">
                                    {name}
                                </th>
                                {days.map(({ date, plan }) => {
                                    const mine = shifts.filter((s) => s.date === date && s.user?.id === id);
                                    const away = leave.some((l) => l.user?.id === id && l.starts_on <= date && l.ends_on >= date);
                                    const marks = `${plan?.opener?.id === id ? "O" : ""}${plan?.closer?.id === id ? "C" : ""}`;

                                    return (
                                        <td key={date} className="p-0 align-top">
                                            <button type="button" onClick={() => jump(date)} className="block w-full text-left">
                                                {away ? <span className="block rounded-[6px] bg-surface-container px-1 py-0.5 text-on-surface-variant">Leave</span> : null}
                                                {mine.map((shift) => (
                                                    <span
                                                        key={shift.id}
                                                        title={SHIFT_CHIP[shift.status].label}
                                                        className={`mb-0.5 block rounded-[6px] px-1 py-0.5 ${
                                                            shift.status === "draft"
                                                                ? "border border-dashed border-outline text-on-surface-variant"
                                                                : shift.status === "accepted"
                                                                  ? "bg-primary-container text-on-primary-container"
                                                                  : "border border-warning/50 bg-warning-container/50 text-on-warning-container"
                                                        }`}
                                                    >
                                                        {hm(shift.starts_at)}–{hm(shift.ends_at)}
                                                        {marks ? <span className="font-bold"> {marks}</span> : null}
                                                    </span>
                                                ))}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-1.5 text-[10px] text-on-surface-variant">Filled: accepted · yellow: not accepted yet · dashed: draft (not sent) · O opens · C closes. Tap a day to edit it.</p>
        </section>
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

export default function Rota({ app, site, week, days = [], drivers = [], people = [], shifts = [], gaps = [], rules = [], leave = [] }: Props): React.ReactElement {
    // Started from a day on the calendar: open a new shift on that day.
    const [editing, setEditing] = useState<Draft | null>(() => {
        const prefill = calendarPrefill();
        const day = prefill.open ? days.find((d) => d.date === prefill.date) : undefined;
        if (!day) return null;

        return { id: null, date: day.date, user_id: "", starts: prefill.time ?? day.hours?.opens_at ?? "08:30", ends: day.hours?.closes_at ?? "17:00" };
    });
    const drafts = shifts.filter((s) => s.status === "draft").length;
    const go = (date: string) => router.get(wr(app, "work.rota", { site: site.id, week: date }), {}, { preserveScroll: true });

    const startEdit = (date: string, hours: DayHours | null, shift?: ShiftView) =>
        setEditing(
            shift
                ? { id: shift.id, date, user_id: String(shift.user?.id ?? ""), starts: hm(shift.starts_at), ends: hm(shift.ends_at) }
                : { id: null, date, user_id: "", starts: hours?.opens_at ?? "08:30", ends: hours?.closes_at ?? "17:00" },
        );

    return (
        <>
            <Head title={`${site.has_shifts ? "Shifts and opening" : "Who opens and closes"} · ${site.name}`} />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Link href={`${wr(app, "work")}?tab=shifts`} className="material-symbols-outlined text-on-surface-variant" aria-label="Back to My work">
                            arrow_back
                        </Link>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-lg font-bold tracking-tight text-on-surface">{site.name}</h1>
                            <p className="text-[11px] font-semibold text-on-surface-variant">{site.has_shifts ? "Shifts and opening" : "Who opens, closes and drives"}</p>
                            <p className="text-[11px] text-outline">Week of {dayDate(week)}</p>
                        </div>
                        <button type="button" className="material-symbols-outlined text-on-surface-variant" onClick={() => go(addDays(week, -7))} aria-label="Previous week">
                            chevron_left
                        </button>
                        <button type="button" className="material-symbols-outlined text-on-surface-variant" onClick={() => go(addDays(week, 7))} aria-label="Next week">
                            chevron_right
                        </button>
                    </div>
                    {site.has_shifts ? <div className="mt-2 flex gap-2">
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
                    </div> : (
                        /* A Main Hub has no shifts: copy only who opens, closes and drives. */
                        <div className="mt-2 flex gap-2">
                            <button type="button" className={ghostBtn} onClick={() => router.post(wr(app, "work.rota.copy", site.id), { week }, { preserveScroll: true })}>
                                Copy last week’s plan
                            </button>
                        </div>
                    )}
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

                    {site.has_shifts ? <WeekGlance days={days} shifts={shifts} leave={leave} /> : null}

                    {days.map(({ date, hours, plan }) => {
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

                                {plan !== null && !closed ? <DayPlan app={app} siteId={site.id} date={date} plan={plan} people={people} drivers={drivers} /> : null}

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
                                                        {plan?.opener?.id === shift.user?.id ? <span className="text-primary"> · Opens</span> : null}
                                                        {plan?.closer?.id === shift.user?.id ? <span className="text-primary"> · Closes</span> : null}
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
                                ) : !closed && site.has_shifts ? (
                                    <button type="button" className="mt-2 text-[12px] font-bold text-primary" onClick={() => startEdit(date, hours)}>
                                        + Add shift
                                    </button>
                                ) : null}
                            </section>
                        );
                    })}

                    {site.has_shifts ? <RulesForm app={app} siteId={site.id} rules={rules} /> : null}
                </div>
            </div>
        </>
    );
}

Rota.layout = workLayout;
