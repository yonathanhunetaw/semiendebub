import { cardCls, ghostBtn, inputCls, primaryBtn, sectionTitle, WEEKDAYS, workLayout, wr } from "@/Components/Work/workUi";
import { dayDate } from "@/utils/dates";
import type { WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";

/**
 * The overtime rules and public holidays. Managers read them; a global admin
 * changes them. Defaults follow the Ethiopian Labour Proclamation 1156/2019.
 */

interface Rules {
    daily_hours: number;
    rate_day: number;
    rate_night: number;
    rate_rest_day: number;
    rate_holiday: number;
    night_from: string;
    night_to: string;
    rest_weekday: number;
    needs_approval: boolean;
}

interface Props {
    app: WorkApp;
    rules: Rules;
    holidays?: { id: number; date: string; name: string }[];
    canEdit: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
    return (
        <label className="block text-[11px] text-on-surface-variant">
            {label}
            <div className="mt-1">{children}</div>
        </label>
    );
}

export default function Overtime({ app, rules, holidays = [], canEdit }: Props): React.ReactElement {
    const form = useForm<Rules>(rules);
    const holiday = useForm({ date: "", name: "" });
    const rate = (key: keyof Rules) => (
        <input type="number" step="0.05" min={1} max={5} disabled={!canEdit} className={inputCls} value={form.data[key] as number} onChange={(e) => form.setData(key, Number(e.target.value) as never)} />
    );

    return (
        <>
            <Head title="Overtime rules" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <Link href={wr(app, "work.sites.index")} className="material-symbols-outlined text-on-surface-variant">
                        arrow_back
                    </Link>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-on-surface">Overtime rules</h1>
                        <p className="text-[11px] text-outline">{canEdit ? "You can change these." : "Only a global admin changes these."}</p>
                    </div>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3">
                    <form
                        className={`${cardCls} grid grid-cols-2 gap-3`}
                        onSubmit={(e) => {
                            e.preventDefault();
                            form.put(wr(app, "work.overtime.save"), { preserveScroll: true });
                        }}
                    >
                        <p className="col-span-2 text-[12px] text-on-surface-variant">
                            Worked time beyond the normal day is overtime. Every minute worked on the weekly rest day or a public holiday is overtime
                            at that day’s rate. Overtime pay = hours × rate × the hourly wage.
                        </p>
                        <Field label="Normal hours a day">
                            <input type="number" step="0.5" min={1} max={16} disabled={!canEdit} className={inputCls} value={form.data.daily_hours} onChange={(e) => form.setData("daily_hours", Number(e.target.value))} />
                        </Field>
                        <Field label="Weekly rest day">
                            <select disabled={!canEdit} className={inputCls} value={form.data.rest_weekday} onChange={(e) => form.setData("rest_weekday", Number(e.target.value))}>
                                {WEEKDAYS.map((name, d) => (
                                    <option key={d} value={d}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Day rate (×)">{rate("rate_day")}</Field>
                        <Field label="Night rate (×)">{rate("rate_night")}</Field>
                        <Field label="Rest-day rate (×)">{rate("rate_rest_day")}</Field>
                        <Field label="Holiday rate (×)">{rate("rate_holiday")}</Field>
                        <Field label="Night from">
                            <input type="time" disabled={!canEdit} className={inputCls} value={form.data.night_from} onChange={(e) => form.setData("night_from", e.target.value)} />
                        </Field>
                        <Field label="Night to">
                            <input type="time" disabled={!canEdit} className={inputCls} value={form.data.night_to} onChange={(e) => form.setData("night_to", e.target.value)} />
                        </Field>
                        <label className="col-span-2 flex items-center gap-2 text-[12px] text-on-surface">
                            <input type="checkbox" disabled={!canEdit} checked={form.data.needs_approval} onChange={(e) => form.setData("needs_approval", e.target.checked)} />
                            A manager approves each day of overtime before it is paid
                        </label>
                        {Object.values(form.errors).map((m) => (
                            <p key={m} className="col-span-2 text-[11px] text-error">
                                {m}
                            </p>
                        ))}
                        {canEdit ? (
                            <button type="submit" className={`col-span-2 ${primaryBtn}`} disabled={form.processing}>
                                Save rules
                            </button>
                        ) : null}
                    </form>

                    <h2 className={sectionTitle}>Public holidays</h2>
                    <section className={cardCls}>
                        <p className="text-[11px] text-on-surface-variant">
                            Enter each year’s dates: some follow the Ethiopian calendar, Easter or the moon (Fasika, Eid…), so they move.
                        </p>
                        {holidays.length === 0 ? <p className="mt-2 text-[12px] text-on-surface-variant">None entered.</p> : null}
                        <ul className="mt-2 divide-y divide-outline-variant/40">
                            {holidays.map((h) => (
                                <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                                    <span className="text-[12px] text-on-surface">
                                        <span className="font-semibold">{dayDate(h.date)}</span> · {h.name}
                                    </span>
                                    {canEdit ? (
                                        <button
                                            type="button"
                                            className="text-[11px] font-bold text-error"
                                            onClick={() => router.delete(wr(app, "work.holidays.destroy", h.id), { preserveScroll: true })}
                                        >
                                            Remove
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                        {canEdit ? (
                            <form
                                className="mt-2 grid grid-cols-[auto_1fr_auto] gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    holiday.post(wr(app, "work.holidays.store"), { preserveScroll: true, onSuccess: () => holiday.reset() });
                                }}
                            >
                                <input type="date" className={inputCls} value={holiday.data.date} onChange={(e) => holiday.setData("date", e.target.value)} required />
                                <input className={inputCls} placeholder="Name (e.g. Meskel)" value={holiday.data.name} onChange={(e) => holiday.setData("name", e.target.value)} required />
                                <button type="submit" className={ghostBtn} disabled={holiday.processing}>
                                    Add
                                </button>
                            </form>
                        ) : null}
                    </section>
                </div>
            </div>
        </>
    );
}

Overtime.layout = workLayout;
