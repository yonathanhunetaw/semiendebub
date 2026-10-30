import type { WeekPlanRow, WorkApp } from "@/types/work";
import { Link } from "@inertiajs/react";
import React from "react";
import { cardCls, KIND_ICON, wr } from "./workUi";

const SHORT_DAY = (date: string): string =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
    });
const DAY_NUMBER = (date: string): string => String(Number(date.slice(8, 10)));

/** Monday of the week a date falls in, for the Rota link. */
const mondayOf = (date: string): string => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const firstName = (name: string | null): string | null => (name ? name.split(" ")[0] : null);

/**
 * One person in a cell: ✓ once they said they will, struck through with ✗ when
 * they can't; "—" in red when nobody is named.
 */
function Who({ label, name, needed, answer }: { label: string; name: string | null; needed: boolean; answer: "yes" | "no" | null }): React.ReactElement {
    return (
        <p
            className="truncate text-[10px] leading-tight"
            title={name ? `${name}${answer === "yes" ? ": said yes" : answer === "no" ? ": can’t" : ": not answered yet"}` : undefined}
        >
            <span className="text-on-surface-variant">{label} </span>
            {name ? (
                <>
                    <span className={answer === "no" ? "font-semibold text-error line-through" : "font-semibold text-on-surface"}>{firstName(name)}</span>
                    {answer === "yes" ? <span className="text-on-success-container"> ✓</span> : answer === "no" ? <span className="font-bold text-error"> ✗</span> : null}
                </>
            ) : (
                <span className={needed ? "font-bold text-error" : "text-on-surface-variant"}>—</span>
            )}
        </p>
    );
}

/**
 * The week ahead at every site I manage, at one glance: per day who opens,
 * closes and drives, and what is missing (in red). Tapping a day opens that
 * week on the Rota, where the plan is set.
 */
export default function WeekPlan({
    app,
    rows,
    flat = false,
}: {
    app: WorkApp;
    rows: WeekPlanRow[];
    /** Inside another panel (the dashboard): no card per site. */ flat?: boolean;
}): React.ReactElement | null {
    if (rows.length === 0) return null;

    return (
        <div>
            <div className={flat ? "divide-y divide-outline-variant/60" : "space-y-3"}>
                {rows.map((row) => {
                    // No hours set for any day: one line to go and set them, not a week of blanks.
                    if (row.days.every((day) => day.no_hours)) {
                        return (
                            <section key={row.site.id} className={`flex flex-wrap items-center gap-2 ${flat ? "py-2.5 first:pt-0 last:pb-0" : cardCls}`}>
                                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">{KIND_ICON[row.site.kind] ?? "storefront"}</span>
                                <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-on-surface">{row.site.name}</p>
                                <Link href={wr(app, "work.sites.show", row.site.id)} className="shrink-0 text-[11px] font-semibold text-on-warning-container">
                                    No opening hours yet · set them
                                </Link>
                            </section>
                        );
                    }

                    // Not fully planned: someone missing, or someone who said they can't.
                    const missing = row.days.filter(
                        (day) => day.status !== "closed_day" && !day.no_hours && (!day.opener || !day.closer || !day.driver || Object.values(day.answers).includes("no")),
                    ).length;

                    return (
                        <section key={row.site.id} className={flat ? "py-2.5 first:pt-0 last:pb-0" : cardCls}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[20px] text-primary">{KIND_ICON[row.site.kind] ?? "storefront"}</span>
                                <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-on-surface">{row.site.name}</p>
                                <span className={`shrink-0 text-[11px] font-semibold ${missing > 0 ? "text-error" : "text-on-success-container"}`}>
                                    {missing > 0 ? `${missing} day${missing === 1 ? "" : "s"} not fully planned` : "All planned"}
                                </span>
                            </div>
                            <div className="mt-2 grid grid-cols-7 gap-1">
                                {row.days.map((day) => {
                                    const off = day.status === "closed_day";
                                    const needed = !off && !day.no_hours;

                                    return (
                                        <Link
                                            key={day.date}
                                            href={wr(app, "work.rota", {
                                                site: row.site.id,
                                                week: mondayOf(day.date),
                                            })}
                                            aria-label={`${row.site.name} ${day.date}`}
                                            className={`min-w-0 rounded-[10px] border px-1 py-1.5 ${
                                                off
                                                    ? "border-outline-variant/40 bg-surface-container"
                                                    : day.status === "open"
                                                      ? "border-success/40 bg-success-container/40"
                                                      : day.status === "missed"
                                                        ? "border-error/40 bg-error-container/40"
                                                        : "border-outline-variant/60"
                                            }`}
                                        >
                                            <p className="text-center text-[10px] font-bold text-on-surface">
                                                {SHORT_DAY(day.date)} {DAY_NUMBER(day.date)}
                                            </p>
                                            {off ? (
                                                <p className="mt-1 text-center text-[10px] text-on-surface-variant">Closed</p>
                                            ) : day.no_hours ? (
                                                <p className="mt-1 text-center text-[10px] text-on-surface-variant">No hours</p>
                                            ) : (
                                                <div className="mt-1 space-y-0.5">
                                                    <Who label="O" name={day.opener} needed={needed} answer={day.answers.opener} />
                                                    <Who label="C" name={day.closer} needed={needed} answer={day.answers.closer} />
                                                    <Who label="D" name={day.driver} needed={needed} answer={day.answers.driver} />
                                                </div>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-on-surface-variant">O opens · C closes · D drives · ✓ said yes · ✗ can’t. Tap a day to plan it.</p>
        </div>
    );
}
