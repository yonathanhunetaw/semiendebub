import KeyCard from "@/Components/Work/KeyCard";
import LeavePanel from "@/Components/Work/LeavePanel";
import OffersPanel from "@/Components/Work/OffersPanel";
import RideCard from "@/Components/Work/RideCard";
import MyShifts from "@/Components/Work/MyShifts";
import SiteDayCard from "@/Components/Work/SiteDayCard";
import { cardCls, clockTime, ghostBtn, inputCls, primaryBtn, sectionTitle, workLayout, wr } from "@/Components/Work/workUi";
import type { CustodyKeyView, KeyHandoverRow, LeaveView, Person, RideView, ShiftView, SiteDayView, SwapView, TimeEntryView, WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";

/**
 * My work: keys handed to me (accept or "not received"), the keys I hold
 * (hand them to the next person), and today at each site I work at.
 */

interface Props {
    app: WorkApp;
    keys?: CustodyKeyView[];
    waiting?: KeyHandoverRow[];
    managesSites?: boolean;
    reasons?: string[];
    /** Today at each site (SiteDayService::todayFor). */
    days?: SiteDayView[];
    shifts?: ShiftView[];
    clock?: TimeEntryView | null;
    leave?: LeaveView[];
    leaveTypes?: string[];
    offers?: SwapView[];
    offered?: SwapView[];
    colleagues?: Record<number, Person[]>;
    rides?: RideView[];
    homeArea?: string | null;
}

export default function WorkIndex({ app, keys = [], waiting = [], managesSites = false, reasons = [], days = [], shifts = [], clock = null, leave = [], leaveTypes = [], offers = [], offered = [], colleagues = {}, rides = [], homeArea = null }: Props): React.ReactElement {
    const accept = (id: number) => router.post(wr(app, "work.key-handovers.accept", id), {}, { preserveScroll: true });
    const reject = (id: number) => router.post(wr(app, "work.key-handovers.reject", id), {}, { preserveScroll: true });
    const area = useForm({ home_area: homeArea ?? "" });

    return (
        <>
            <Head title="My work" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-on-surface">My work</h1>
                        <p className="text-[11px] text-outline">Keys you hold and the sites you work at.</p>
                    </div>
                    <div className="flex gap-2">
                        {app !== "delivery" ? (
                            <Link href={wr(app, "work.rides")} className={ghostBtn}>
                                Rides
                            </Link>
                        ) : null}
                        {managesSites ? (
                            <>
                                <Link href={wr(app, "work.team")} className={ghostBtn}>
                                    Team
                                </Link>
                                <Link href={wr(app, "work.sites.index")} className={ghostBtn}>
                                    Sites
                                </Link>
                            </>
                        ) : null}
                    </div>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3">
                    {clock ? (
                        <section className="flex items-center gap-3 rounded-[16px] border border-success/30 bg-success-container/50 p-3.5">
                            <span className="material-symbols-outlined text-[26px] text-on-success-container">schedule</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-on-success-container">
                                    Clocked in at <span className="font-bold">{clock.site?.name}</span> since {clockTime(clock.clock_in_at)}.
                                    {clock.on_break ? " You are on a break." : " Scan the counter screen to clock out."}
                                </p>
                                <button
                                    type="button"
                                    className={`mt-2 ${clock.on_break ? primaryBtn : ghostBtn}`}
                                    onClick={() => router.post(wr(app, clock.on_break ? "work.break.end" : "work.break.start"), {}, { preserveScroll: true })}
                                >
                                    {clock.on_break ? "End break" : "Start a break"}
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {waiting.map((handover) => (
                        <section key={handover.id} className="rounded-[16px] border border-info/40 bg-info-container/40 p-3.5 shadow-sm">
                            <p className="text-[13px] font-bold text-on-surface">
                                {handover.from?.name ?? "A manager"} handed you the {handover.key_label}
                            </p>
                            <p className="mt-0.5 text-[11px] text-on-surface-variant">
                                Accept only once it is in your hand. Until then the key stays with them.
                                {handover.note ? ` · “${handover.note}”` : ""}
                            </p>
                            <div className="mt-3 flex gap-2">
                                <button type="button" className={primaryBtn} onClick={() => accept(handover.id)}>
                                    I have it
                                </button>
                                <button type="button" className={ghostBtn} onClick={() => reject(handover.id)}>
                                    Not received
                                </button>
                            </div>
                        </section>
                    ))}

                    <OffersPanel app={app} offers={offers} />

                    {days.length > 0 ? (
                        <>
                            <h2 className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Today</h2>
                            {days.map((day) => (
                                <SiteDayCard key={day.id} day={day}>
                                    {day.status === "open" && (day.i_opened || day.manages) ? (
                                        <Link href={wr(app, "work.sites.counter", day.site.id)} className={`mt-3 inline-block ${ghostBtn}`}>
                                            Counter screen
                                        </Link>
                                    ) : day.status !== "open" && day.status !== "closed" && (day.i_hold_key || day.manages) ? (
                                        <p className="mt-2.5 text-[11px] text-on-surface-variant">
                                            To open, scan the printed QR at the counter with your phone camera.
                                        </p>
                                    ) : null}
                                </SiteDayCard>
                            ))}
                        </>
                    ) : null}

                    <h2 className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Your shifts</h2>
                    <MyShifts app={app} shifts={shifts} offered={offered} colleagues={colleagues} />

                    {rides.length > 0 ? (
                        <>
                            <h2 className={sectionTitle}>Your rides</h2>
                            {rides.map((ride) => (
                                <RideCard key={ride.id} app={app} ride={ride} />
                            ))}
                        </>
                    ) : null}

                    {app !== "delivery" ? (
                        <>
                            <h2 className={sectionTitle}>Leave</h2>
                            <LeavePanel app={app} leave={leave} types={leaveTypes} />
                        </>
                    ) : null}

                    <h2 className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Keys you hold</h2>
                    {keys.length === 0 ? (
                        <p className={`${cardCls} text-[12px] text-on-surface-variant`}>You hold no keys right now.</p>
                    ) : (
                        keys.map((key) => <KeyCard key={key.id} app={app} keyView={key} reasons={reasons} />)
                    )}

                    {app !== "delivery" ? (
                        <form
                            className={cardCls}
                            onSubmit={(e) => {
                                e.preventDefault();
                                area.put(wr(app, "work.home-area"), { preserveScroll: true });
                            }}
                        >
                            <h2 className="text-[13px] font-bold text-on-surface">Where staff transport drops you</h2>
                            <div className="mt-2 flex gap-2">
                                <input
                                    className={inputCls}
                                    placeholder="Area or landmark (e.g. Bole Bulbula, near the church)"
                                    value={area.data.home_area}
                                    onChange={(e) => area.setData("home_area", e.target.value)}
                                />
                                <button type="submit" className={primaryBtn} disabled={area.processing}>
                                    Save
                                </button>
                            </div>
                        </form>
                    ) : null}
                </div>
            </div>
        </>
    );
}

WorkIndex.layout = workLayout;
