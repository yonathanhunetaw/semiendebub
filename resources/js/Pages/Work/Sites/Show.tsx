import KeyCard from "@/Components/Work/KeyCard";
import SiteDayCard from "@/Components/Work/SiteDayCard";
import { cardCls, ghostBtn, inputCls, KIND_ICON, primaryBtn, WEEKDAYS, workLayout, wr } from "@/Components/Work/workUi";
import { dayDate } from "@/utils/dates";
import type { CustodyKeyView, DayHours, SiteDayStatus, SiteDayView, SiteHourExceptionRow, SiteKind, WeekdayHours, WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";

/**
 * One site for its managers: the week's opening hours, dates that differ
 * (holidays, short days), the key with its whole log, and who works there.
 */

interface Props {
    app: WorkApp;
    site: { id: number; name: string; kind: SiteKind; kind_label: string; address: string | null; has_shifts: boolean };
    week?: WeekdayHours[];
    exceptions?: SiteHourExceptionRow[];
    key: CustodyKeyView;
    people?: { id: number; name: string; role: string }[];
    today: SiteDayView;
    /** The next 7 days: who opens and closes. */
    plan?: { date: string; status: SiteDayStatus; hours: DayHours | null; opener_id: number | null; closer_id: number | null }[];
    settings: { open_grace_minutes: number; opening_checklist: string[]; closing_checklist: string[] };
}

const lines = (text: string): string[] =>
    text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

export default function SiteShow({ app, site, week = [], exceptions = [], key, people = [], today, plan = [], settings }: Props): React.ReactElement {
    const hours = useForm<{ days: WeekdayHours[] }>({ days: week });
    const exception = useForm({ date: "", closed: true, opens_at: "", closes_at: "", note: "" });

    const setDay = (index: number, patch: Partial<WeekdayHours>) =>
        hours.setData(
            "days",
            hours.data.days.map((day, i) => (i === index ? { ...day, ...patch } : day)),
        );

    const saveHours = (e: React.FormEvent) => {
        e.preventDefault();
        hours.put(wr(app, "work.sites.hours", site.id), { preserveScroll: true });
    };

    const saveException = (e: React.FormEvent) => {
        e.preventDefault();
        exception.post(wr(app, "work.sites.exceptions.store", site.id), {
            preserveScroll: true,
            onSuccess: () => exception.reset(),
        });
    };

    const removeException = (id: number) =>
        router.delete(wr(app, "work.sites.exceptions.destroy", [site.id, id]), { preserveScroll: true });

    const errors = hours.errors as Record<string, string>;

    const planForm = useForm({ days: plan.map(({ date, opener_id, closer_id }) => ({ date, opener_id, closer_id })) });
    const setPlan = (index: number, field: "opener_id" | "closer_id", value: string) =>
        planForm.setData(
            "days",
            planForm.data.days.map((day, i) => (i === index ? { ...day, [field]: value ? Number(value) : null } : day)),
        );

    const settingsForm = useForm({
        open_grace_minutes: settings.open_grace_minutes,
        opening: settings.opening_checklist.join("\n"),
        closing: settings.closing_checklist.join("\n"),
    });
    const saveSettings = (e: React.FormEvent) => {
        e.preventDefault();
        settingsForm.transform((data) => ({
            open_grace_minutes: Number(data.open_grace_minutes),
            opening_checklist: lines(data.opening),
            closing_checklist: lines(data.closing),
        }));
        settingsForm.put(wr(app, "work.sites.settings", site.id), { preserveScroll: true });
    };

    return (
        <>
            <Head title={site.name} />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <Link href={wr(app, "work.sites.index")} className="material-symbols-outlined text-on-surface-variant">
                        arrow_back
                    </Link>
                    <span className="material-symbols-outlined text-[24px] text-primary">{KIND_ICON[site.kind]}</span>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-bold tracking-tight text-on-surface">{site.name}</h1>
                        <p className="text-[11px] text-outline">
                            {site.kind_label}
                            {site.address ? ` · ${site.address}` : ""}
                        </p>
                    </div>
                </header>

                <div className="mx-auto max-w-2xl space-y-4 px-3.5 pt-3">
                    <SiteDayCard day={today}>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {site.has_shifts ? (
                                <>
                                    <Link href={wr(app, "work.rota", { site: site.id })} className={primaryBtn}>
                                        Rota
                                    </Link>
                                    <Link href={wr(app, "work.attendance", { site: site.id })} className={ghostBtn}>
                                        Attendance
                                    </Link>
                                </>
                            ) : null}
                            <Link href={wr(app, "work.sites.printed-qr", site.id)} className={ghostBtn}>
                                Printed QR
                            </Link>
                            {today.status === "open" ? (
                                <Link href={wr(app, "work.sites.counter", site.id)} className={ghostBtn}>
                                    Counter screen
                                </Link>
                            ) : null}
                        </div>
                    </SiteDayCard>

                    <KeyCard app={app} keyView={key} showLog />

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            planForm.put(wr(app, "work.sites.plan", site.id), { preserveScroll: true });
                        }}
                        className={cardCls}
                    >
                        <h2 className="text-[13px] font-bold text-on-surface">Who opens and closes</h2>
                        <p className="text-[11px] text-on-surface-variant">The next 7 days. They see it in their bell; the key holder is told whom to hand it to.</p>
                        <div className="mt-2 divide-y divide-outline-variant/40">
                            {planForm.data.days.map((day, i) => {
                                const row = plan[i];
                                const closed = row?.hours?.closed || row?.status === "closed_day";
                                return (
                                    <div key={day.date} className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 py-2">
                                        <span className="text-[12px] font-semibold text-on-surface">
                                            {dayDate(day.date)}
                                            <span className="block text-[10px] font-normal text-on-surface-variant">
                                                {closed ? "Closed" : row?.hours ? `${row.hours.opens_at}–${row.hours.closes_at}` : "No hours"}
                                            </span>
                                        </span>
                                        {closed ? (
                                            <span className="col-span-2 text-[11px] text-outline">—</span>
                                        ) : (
                                            <>
                                                <select className={inputCls} value={day.opener_id ?? ""} onChange={(e) => setPlan(i, "opener_id", e.target.value)}>
                                                    <option value="">Opener…</option>
                                                    {people.map((p) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <select className={inputCls} value={day.closer_id ?? ""} onChange={(e) => setPlan(i, "closer_id", e.target.value)}>
                                                    <option value="">Closer…</option>
                                                    {people.map((p) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <button type="submit" className={`mt-3 ${primaryBtn}`} disabled={planForm.processing}>
                            Save
                        </button>
                    </form>

                    <form onSubmit={saveHours} className={cardCls}>
                        <h2 className="text-[13px] font-bold text-on-surface">Opening hours</h2>
                        <div className="mt-2 divide-y divide-outline-variant/40">
                            {hours.data.days.map((day, i) => (
                                <div key={day.weekday} className="flex flex-wrap items-center gap-2 py-2">
                                    <span className="w-24 text-[12px] font-semibold text-on-surface">{WEEKDAYS[day.weekday]}</span>
                                    <label className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                                        <input type="checkbox" checked={day.closed} onChange={(e) => setDay(i, { closed: e.target.checked })} />
                                        Closed
                                    </label>
                                    {!day.closed ? (
                                        <>
                                            <input
                                                type="time"
                                                className={`${inputCls} w-28`}
                                                value={day.opens_at ?? ""}
                                                onChange={(e) => setDay(i, { opens_at: e.target.value || null })}
                                            />
                                            <span className="text-[11px] text-outline">to</span>
                                            <input
                                                type="time"
                                                className={`${inputCls} w-28`}
                                                value={day.closes_at ?? ""}
                                                onChange={(e) => setDay(i, { closes_at: e.target.value || null })}
                                            />
                                        </>
                                    ) : null}
                                    {errors[`days.${i}.closes_at`] ? (
                                        <span className="w-full text-[11px] text-error">{errors[`days.${i}.closes_at`]}</span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        <p className="mt-1 text-[11px] text-on-surface-variant">A day with no times and not closed counts as “hours not set”.</p>
                        <button type="submit" className={`mt-3 ${primaryBtn}`} disabled={hours.processing}>
                            Save hours
                        </button>
                    </form>

                    <section className={cardCls}>
                        <h2 className="text-[13px] font-bold text-on-surface">Dates that differ</h2>
                        <p className="text-[11px] text-on-surface-variant">Holidays, or a day with other hours.</p>

                        {exceptions.length > 0 ? (
                            <ul className="mt-2 divide-y divide-outline-variant/40">
                                {exceptions.map((row) => (
                                    <li key={row.id} className="flex items-center justify-between gap-2 py-2">
                                        <p className="text-[12px] text-on-surface">
                                            <span className="font-semibold">{dayDate(row.date)}</span> ·{" "}
                                            {row.closed ? "Closed" : `${row.opens_at} – ${row.closes_at}`}
                                            {row.note ? <span className="text-on-surface-variant"> · {row.note}</span> : null}
                                        </p>
                                        <button type="button" className="text-[11px] font-bold text-error" onClick={() => removeException(row.id)}>
                                            Remove
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        <form onSubmit={saveException} className="mt-3 grid grid-cols-2 gap-2">
                            <input
                                type="date"
                                className={inputCls}
                                value={exception.data.date}
                                onChange={(e) => exception.setData("date", e.target.value)}
                                required
                            />
                            <label className="flex items-center gap-1 text-[12px] text-on-surface">
                                <input
                                    type="checkbox"
                                    checked={exception.data.closed}
                                    onChange={(e) => exception.setData("closed", e.target.checked)}
                                />
                                Closed all day
                            </label>
                            {!exception.data.closed ? (
                                <>
                                    <input
                                        type="time"
                                        className={inputCls}
                                        value={exception.data.opens_at}
                                        onChange={(e) => exception.setData("opens_at", e.target.value)}
                                    />
                                    <input
                                        type="time"
                                        className={inputCls}
                                        value={exception.data.closes_at}
                                        onChange={(e) => exception.setData("closes_at", e.target.value)}
                                    />
                                </>
                            ) : null}
                            <input
                                className={`${inputCls} col-span-2`}
                                placeholder="Note (e.g. Meskel)"
                                value={exception.data.note}
                                onChange={(e) => exception.setData("note", e.target.value)}
                            />
                            {Object.values(exception.errors).map((message) => (
                                <p key={message} className="col-span-2 text-[11px] text-error">
                                    {message}
                                </p>
                            ))}
                            <button type="submit" className={`col-span-2 ${ghostBtn}`} disabled={exception.processing}>
                                Add date
                            </button>
                        </form>
                    </section>

                    <form onSubmit={saveSettings} className={cardCls}>
                        <h2 className="text-[13px] font-bold text-on-surface">Opening and closing</h2>
                        <label className="mt-2 block text-[11px] text-on-surface-variant">
                            Minutes after opening time before it counts as late
                            <input
                                type="number"
                                min={0}
                                max={240}
                                className={`${inputCls} mt-1 w-28`}
                                value={settingsForm.data.open_grace_minutes}
                                onChange={(e) => settingsForm.setData("open_grace_minutes", Number(e.target.value))}
                            />
                        </label>
                        <label className="mt-2 block text-[11px] text-on-surface-variant">
                            Opening checklist (one per line)
                            <textarea
                                rows={3}
                                className={`${inputCls} mt-1`}
                                value={settingsForm.data.opening}
                                onChange={(e) => settingsForm.setData("opening", e.target.value)}
                            />
                        </label>
                        <label className="mt-2 block text-[11px] text-on-surface-variant">
                            Closing checklist (one per line)
                            <textarea
                                rows={3}
                                className={`${inputCls} mt-1`}
                                value={settingsForm.data.closing}
                                onChange={(e) => settingsForm.setData("closing", e.target.value)}
                            />
                        </label>
                        <button type="submit" className={`mt-3 ${primaryBtn}`} disabled={settingsForm.processing}>
                            Save
                        </button>
                    </form>

                    <section className={cardCls}>
                        <h2 className="text-[13px] font-bold text-on-surface">Who works here</h2>
                        {people.length === 0 ? (
                            <p className="mt-1 text-[12px] text-on-surface-variant">Nobody yet.</p>
                        ) : (
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                                {people.map((person) => (
                                    <li
                                        key={person.id}
                                        className="rounded-[999px] border border-outline-variant/60 bg-surface-container px-2.5 py-1 text-[11px] text-on-surface"
                                    >
                                        {person.name} <span className="text-on-surface-variant">· {person.role}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </>
    );
}

SiteShow.layout = workLayout;
