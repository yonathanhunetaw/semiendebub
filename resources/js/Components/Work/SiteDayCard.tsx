import { dayDateTime } from "@/utils/dates";
import type { SiteDayView } from "@/types/work";
import React from "react";
import { cardCls, hm, hoursText, KIND_ICON } from "./workUi";

const STATUS: Record<SiteDayView["status"], { label: string; className: string }> = {
    planned: { label: "Not open yet", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
    open: { label: "Open", className: "border-success/30 bg-success-container/60 text-on-success-container" },
    closed: { label: "Closed for the day", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
    missed: { label: "Late opening", className: "border-error/30 bg-error-container/60 text-on-error-container" },
    closed_day: { label: "Closed today", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
};

/** Today at one site: hours, who opens, closes and drives, who did, the key. */
export default function SiteDayCard({ day, children }: { day: SiteDayView; children?: React.ReactNode }): React.ReactElement {
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

            {children}
        </section>
    );
}
