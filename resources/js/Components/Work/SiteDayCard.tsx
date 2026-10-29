import { dayDateTime } from "@/utils/dates";
import type { SiteDayView, WorkApp } from "@/types/work";
import { router } from "@inertiajs/react";
import React from "react";
import { cardCls, ghostBtn, hm, hoursText, inputCls, KIND_ICON, primaryBtn, wr } from "./workUi";

const STATUS: Record<SiteDayView["status"], { label: string; className: string }> = {
    planned: { label: "Not open yet", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
    open: { label: "Open", className: "border-success/30 bg-success-container/60 text-on-success-container" },
    closed: { label: "Closed for the day", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
    missed: { label: "Late opening", className: "border-error/30 bg-error-container/60 text-on-error-container" },
    closed_day: { label: "Closed today", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
};

/**
 * A day nobody closed: a manager says when the shop really closed and counts the
 * till. Sales after that moment count as outside open hours.
 */
function LateClose({ app, day }: { app: WorkApp; day: SiteDayView }): React.ReactElement {
    const [shown, setShown] = React.useState(false);
    const [closedAt, setClosedAt] = React.useState("");
    const [till, setTill] = React.useState("");
    const [note, setNote] = React.useState("");
    const [why, setWhy] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    return (
        <div className="mt-3 rounded-[12px] border border-error/30 bg-error-container/50 p-3">
            <p className="text-[12px] font-bold text-on-error-container">Still open from {dayDateTime(day.opened_at, day.date)}. Nobody closed it.</p>
            {shown ? (
                <div className="mt-2 space-y-2">
                    <label className="block text-[11px] text-on-surface-variant">
                        When did the shop really close?
                        <input type="datetime-local" className={`mt-1 ${inputCls}`} value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
                    </label>
                    <label className="block text-[11px] text-on-surface-variant">
                        Till count (ETB)
                        <input type="number" min="0" className={`mt-1 ${inputCls}`} value={till} onChange={(e) => setTill(e.target.value)} />
                    </label>
                    <label className="block text-[11px] text-on-surface-variant">
                        If the count is not what it should be, say why
                        <input type="text" className={`mt-1 ${inputCls}`} value={why} onChange={(e) => setWhy(e.target.value)} />
                    </label>
                    <label className="block text-[11px] text-on-surface-variant">
                        Why was it not closed at the counter?
                        <input type="text" className={`mt-1 ${inputCls}`} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={primaryBtn}
                            disabled={busy || closedAt === "" || note.trim() === ""}
                            onClick={() => {
                                setBusy(true);
                                router.post(
                                    wr(app, "work.sites.close-late", day.site.id),
                                    { closed_at: closedAt, till_count: till === "" ? null : Number(till), note, difference_note: why || null },
                                    { preserveScroll: true, onFinish: () => setBusy(false) },
                                );
                            }}
                        >
                            Close that day
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setShown(false)}>
                            Not now
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" className={`mt-2 ${ghostBtn}`} onClick={() => setShown(true)}>
                    Close it now…
                </button>
            )}
        </div>
    );
}

const etb = (amount: number): string => `ETB ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The day's cash: frozen when the day closed, or so far for a manager while it is open. */
function CashLines({ cash }: { cash: NonNullable<SiteDayView["cash"]> }): React.ReactElement {
    const off = cash.difference !== null && Math.abs(cash.difference) >= 0.01;

    return (
        <div className="mt-2.5 rounded-[12px] border border-outline-variant/60 bg-surface-container px-3 py-2 text-[11px]">
            <p className="font-bold text-on-surface">{cash.final ? "Cash for the day (final)" : "Cash so far today"}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <dt className="text-on-surface-variant">Taken</dt>
                <dd className="text-on-surface">{etb(cash.collected)}</dd>
                {cash.unconfirmed > 0 ? (
                    <>
                        <dt className="text-on-surface-variant">Not confirmed yet</dt>
                        <dd className="text-on-surface">{etb(cash.unconfirmed)}</dd>
                    </>
                ) : null}
                <dt className="text-on-surface-variant">Handed over</dt>
                <dd className="text-on-surface">{etb(cash.handed_over)}</dd>
                <dt className="text-on-surface-variant">Should be in the till</dt>
                <dd className="text-on-surface">{etb(cash.expected)}</dd>
                {cash.counted !== null ? (
                    <>
                        <dt className="text-on-surface-variant">Counted</dt>
                        <dd className="text-on-surface">{etb(cash.counted)}</dd>
                    </>
                ) : null}
            </dl>
            {off ? (
                <p className="mt-1 font-semibold text-on-error-container">
                    {cash.difference! < 0 ? "Short by" : "Over by"} {etb(Math.abs(cash.difference!))}
                    {cash.why ? ` · ${cash.why}` : ""}
                </p>
            ) : cash.final && cash.difference !== null ? (
                <p className="mt-1 font-semibold text-on-success-container">The till matched.</p>
            ) : null}
        </div>
    );
}

/** Today at one site: hours, who opens, closes and drives, who did, the key. */
export default function SiteDayCard({ day, app, children }: { day: SiteDayView; app?: WorkApp; children?: React.ReactNode }): React.ReactElement {
    const chip = STATUS[day.status];

    return (
        <section className={cardCls}>
            <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[24px] text-primary">{KIND_ICON[day.site.kind] ?? "storefront"}</span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-on-surface">{day.site.name}</p>
                    <p className="text-[11px] text-on-surface-variant">{hoursText(day.hours)}</p>
                </div>
                <span className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${chip.className}`}>{chip.label}</span>
            </div>

            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-on-surface-variant">Opens</dt>
                <dd className="text-on-surface">
                    {day.opened_at ? `${day.opened_by} · ${dayDateTime(day.opened_at, "")}` : (day.opener?.name ?? "Not named")}
                    {day.opened_without_key ? " · without the key" : ""}
                </dd>
                <dt className="text-on-surface-variant">Closes</dt>
                <dd className="text-on-surface">
                    {day.closed_at ? `${day.closed_by} · ${dayDateTime(day.closed_at, "")}` : (day.closer?.name ?? "Not named")}
                </dd>
                <dt className="text-on-surface-variant">Driver</dt>
                <dd className={day.driver ? "text-on-surface" : "font-semibold text-on-warning-container"}>
                    {day.driver?.name ?? "No driver planned"}
                    {day.rides.map((ride) => ` · ${ride.purpose === "opening" ? "pick-up" : "home"} ${hm(ride.departs_at)}`).join("")}
                    {day.no_driver ? " · went ahead without one" : ""}
                </dd>
                <dt className="text-on-surface-variant">Key</dt>
                <dd className="text-on-surface">{day.i_hold_key ? "You hold it" : (day.key_holder?.name ?? "Nobody holds it")}</dd>
                {day.float_amount !== null ? (
                    <>
                        <dt className="text-on-surface-variant">Cash float</dt>
                        <dd className="text-on-surface">ETB {day.float_amount.toLocaleString()}</dd>
                    </>
                ) : null}
                {day.till_count !== null ? (
                    <>
                        <dt className="text-on-surface-variant">Till at close</dt>
                        <dd className="text-on-surface">ETB {day.till_count.toLocaleString()}</dd>
                    </>
                ) : null}
            </dl>

            {day.cash ? <CashLines cash={day.cash} /> : null}

            {day.closed_late ? <p className="mt-2 text-[11px] font-semibold text-on-warning-container">Closed afterwards by a manager.</p> : null}

            {app && day.manages && day.overdue_close ? <LateClose app={app} day={day} /> : null}

            {children}
        </section>
    );
}
