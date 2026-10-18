import { dayDate } from "@/utils/dates";
import type { SwapView, WorkApp } from "@/types/work";
import { router } from "@inertiajs/react";
import React from "react";
import { DUTY_LABEL, ghostBtn, hm, primaryBtn, wr } from "./workUi";

/** Shifts a colleague offered me: take (a manager then approves) or decline. */
export default function OffersPanel({ app, offers }: { app: WorkApp; offers: SwapView[] }): React.ReactElement | null {
    if (offers.length === 0) return null;

    return (
        <>
            {offers.map((swap) => (
                <section key={swap.id} className="rounded-[16px] border border-info/40 bg-info-container/40 p-3.5 shadow-sm">
                    <p className="text-[13px] font-bold text-on-surface">
                        {swap.from?.name} offers you their shift
                    </p>
                    {swap.shift ? (
                        <p className="text-[12px] text-on-surface-variant">
                            {dayDate(swap.shift.date)} · {hm(swap.shift.starts_at)}–{hm(swap.shift.ends_at)} at {swap.shift.site?.name}
                            {swap.shift.duty !== "none" ? ` · ${DUTY_LABEL[swap.shift.duty].toLowerCase()} the site` : ""}
                            {swap.note ? ` · “${swap.note}”` : ""}
                        </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                        <button type="button" className={primaryBtn} onClick={() => router.post(wr(app, "work.swaps.take", swap.id), {}, { preserveScroll: true })}>
                            Take it
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => router.post(wr(app, "work.swaps.decline", swap.id), {}, { preserveScroll: true })}>
                            No thanks
                        </button>
                    </div>
                </section>
            ))}
        </>
    );
}
