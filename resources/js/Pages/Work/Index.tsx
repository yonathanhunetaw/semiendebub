import CounterScan from "@/Components/Work/CounterScan";
import DutyCard from "@/Components/Work/DutyCard";
import KeyCard from "@/Components/Work/KeyCard";
import LeavePanel from "@/Components/Work/LeavePanel";
import OffersPanel from "@/Components/Work/OffersPanel";
import RideCard from "@/Components/Work/RideCard";
import MyShifts from "@/Components/Work/MyShifts";
import SiteDayCard from "@/Components/Work/SiteDayCard";
import WeekPlan from "@/Components/Work/WeekPlan";
import { cardCls, clockTime, ghostBtn, inputCls, KIND_ICON, primaryBtn, sectionTitle, workLayout, wr } from "@/Components/Work/workUi";
import type { CustodyKeyView, DutyView, KeyHandoverRow, LeaveView, Person, RideView, ShiftView, SiteDayView, SiteKind, SwapView, TimeEntryView, WeekPlanRow, WorkApp } from "@/types/work";
import { Head, Link, router, useForm } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * My work, in five tabs:
 *   Today   clocked in or not, keys waiting for me, my jobs today as steps (open:
 *           the key, then scan the counter QR; close; drive: take the car), and
 *           each site I work at today: who opens, closes and drives, open or not.
 *   Shifts  what I open, close or drive in the week ahead; mine (accept, ask for
 *           a change, give to a colleague); a manager sees the week's plan at
 *           every site, gaps in red, and plans shifts and opening from here.
 *   Keys    the ones I hold (hand them on); a manager also sees their sites' keys.
 *   Leave   ask for it.
 *   Rides   staff transport I'm on, and where it drops me.
 * The tab is kept in ?tab= so a reload (or a redirect back) stays on it.
 */

type Tab = "today" | "shifts" | "keys" | "leave" | "rides";

interface ManagedSite {
    id: number;
    name: string;
    kind: SiteKind;
    kind_label: string;
    has_shifts: boolean;
}

interface Props {
    app: WorkApp;
    keys?: CustodyKeyView[];
    waiting?: KeyHandoverRow[];
    managesSites?: boolean;
    sites?: ManagedSite[];
    /** Keys of the sites I manage that someone else holds, with their log. */
    siteKeys?: CustodyKeyView[];
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
    /** A driver's runs from the days' plans. */
    driving?: RideView[];
    /** Days I open, close or drive, today and the week ahead (SiteDayService::dutiesFor). */
    duties?: DutyView[];
    /** Cars a driver can take a run with. */
    vehicles?: { id: number; name: string; plate: string; key_holder_id: number | null }[];
    meId?: number;
    /** The week ahead at each site I manage (SiteDayService::weekPlan). */
    weekPlan?: WeekPlanRow[];
    homeArea?: string | null;
}

const tabFromUrl = (tabs: Tab[]): Tab => {
    const wanted = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return wanted && tabs.includes(wanted) ? wanted : "today";
};

export default function WorkIndex({
    app,
    keys = [],
    waiting = [],
    managesSites = false,
    sites = [],
    siteKeys = [],
    reasons = [],
    days = [],
    shifts = [],
    clock = null,
    leave = [],
    leaveTypes = [],
    offers = [],
    offered = [],
    colleagues = {},
    rides = [],
    driving = [],
    duties = [],
    vehicles = [],
    meId,
    weekPlan = [],
    homeArea = null,
}: Props): React.ReactElement {
    const todayDuties = duties.filter((duty) => duty.is_today);
    // A site with no hours today where nothing happened or is planned: one line for all of them, not a card each.
    const idle = (day: SiteDayView) => day.hours === null && day.status === "planned" && !day.opener && !day.closer && !day.driver && !day.i_hold_key;
    const activeDays = days.filter((day) => !idle(day));
    const idleDays = days.filter(idle);
    const laterDuties = duties.filter((duty) => !duty.is_today);
    // Runs not tied to one of my duty days (the plan moved on): still shown, so nothing is lost.
    const looseRuns = driving.filter((ride) => !duties.some((duty) => duty.rides.some((planned) => planned.id === ride.id)));
    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: "today", label: "Today", count: waiting.length + todayDuties.length },
        { id: "shifts", label: "Shifts", count: shifts.filter((s) => s.status === "published" || s.status === "change_requested").length + offers.length + laterDuties.filter((duty) => duty.my_roles.some((kind) => duty.answers[kind] === null)).length },
        { id: "keys", label: "Keys", count: waiting.length },
        ...(app !== "delivery" ? [{ id: "leave" as Tab, label: "Leave", count: 0 }] : []),
        { id: "rides", label: "Rides", count: 0 },
    ];
    const [tab, setTab] = useState<Tab>(() => tabFromUrl(tabs.map((t) => t.id)));
    const choose = (next: Tab) => {
        setTab(next);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", url);
    };

    const accept = (id: number) => router.post(wr(app, "work.key-handovers.accept", id), {}, { preserveScroll: true });
    const reject = (id: number) => router.post(wr(app, "work.key-handovers.reject", id), {}, { preserveScroll: true });
    const area = useForm({ home_area: homeArea ?? "" });

    const waitingKeys = waiting.map((handover) => (
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
    ));

    return (
        <>
            <Head title="My work" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 pt-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-on-surface">My work</h1>
                            <p className="text-[11px] text-outline">Your day, shifts, keys, leave and rides.</p>
                        </div>
                        {managesSites ? (
                            <div className="flex gap-2">
                                <Link href={wr(app, "work.team")} className={ghostBtn}>
                                    Team
                                </Link>
                                <Link href={wr(app, "work.sites.index")} className={ghostBtn}>
                                    Site setup
                                </Link>
                            </div>
                        ) : null}
                    </div>
                    <nav role="tablist" aria-label="My work" className="mt-2 flex gap-1 overflow-x-auto">
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === t.id}
                                onClick={() => choose(t.id)}
                                className={`flex shrink-0 items-center gap-1 border-b-2 px-3 py-2 text-[13px] font-bold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant"}`}
                            >
                                {t.label}
                                {t.count > 0 ? <span className="rounded-[999px] bg-primary px-1.5 text-[10px] text-on-primary">{t.count}</span> : null}
                            </button>
                        ))}
                    </nav>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3" role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
                    {tab === "today" ? (
                        <>
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

                            {waitingKeys}

                            {todayDuties.length > 0 ? (
                                <>
                                    <h2 className={sectionTitle}>Your jobs today</h2>
                                    {todayDuties.map((duty) => (
                                        <DutyCard key={duty.id} app={app} duty={duty} driving={driving} vehicles={vehicles} meId={meId} />
                                    ))}
                                </>
                            ) : null}

                            {looseRuns.length > 0 ? (
                                <>
                                    <h2 className={sectionTitle}>Other runs you drive</h2>
                                    {looseRuns.map((ride) => (
                                        <RideCard key={ride.id} app={app} ride={ride} vehicles={vehicles} meId={meId} />
                                    ))}
                                    <Link href={wr(app, "work.rides")} className={`block text-center ${cardCls} py-2 text-[12px] font-bold text-primary`}>
                                        All staff rides
                                    </Link>
                                </>
                            ) : null}

                            {/* A driver who works at no site has only their jobs above. */}
                            {days.length > 0 || duties.length === 0 ? <h2 className={sectionTitle}>Opening and closing today</h2> : null}
                            {days.length === 0 && duties.length === 0 ? <p className={`${cardCls} text-[12px] text-on-surface-variant`}>You do not work at any site.</p> : null}
                            {activeDays.map((day) => (
                                <SiteDayCard key={day.id} day={day} app={app}>
                                    {day.status === "open" && (day.i_opened || day.manages) ? (
                                        <Link href={wr(app, "work.sites.counter", day.site.id)} className={`mt-3 inline-block ${ghostBtn}`}>
                                            Counter screen
                                        </Link>
                                    ) : null}
                                    {/* Anyone who could open or close it gets the scanner; the counter page says what is allowed. */}
                                    {day.status !== "closed" && day.status !== "closed_day" && (day.i_hold_key || day.manages || day.opener?.id === meId || day.closer?.id === meId) ? (
                                        <div className="mt-2.5">
                                            <CounterScan app={app} label={day.status === "open" ? "Scan to clock in or close" : "Scan to open"} className={ghostBtn} />
                                        </div>
                                    ) : null}
                                    {day.manages ? (
                                        <Link href={wr(app, "work.rota", { site: day.site.id })} className="mt-2 block text-[12px] font-bold text-primary">
                                            Plan who opens, closes and drives
                                        </Link>
                                    ) : null}
                                </SiteDayCard>
                            ))}
                            {idleDays.length > 0 ? (
                                <p className={`${cardCls} text-[12px] text-on-surface-variant`}>
                                    No opening hours and nobody planned today: {idleDays.map((day) => day.site.name).join(", ")}.
                                    {managesSites ? (
                                        <>
                                            {" "}
                                            <Link href={wr(app, "work.sites.index")} className="font-bold text-primary">
                                                Set hours on Site setup
                                            </Link>
                                        </>
                                    ) : null}
                                </p>
                            ) : null}
                        </>
                    ) : null}

                    {tab === "shifts" ? (
                        <>
                            <OffersPanel app={app} offers={offers} />
                            {laterDuties.length > 0 ? (
                                <>
                                    <h2 className={sectionTitle}>Coming up: you open, close or drive</h2>
                                    {laterDuties.map((duty) => (
                                        <DutyCard key={duty.id} app={app} duty={duty} driving={driving} vehicles={vehicles} meId={meId} />
                                    ))}
                                </>
                            ) : null}
                            <h2 className={sectionTitle}>Your shifts</h2>
                            <MyShifts app={app} shifts={shifts} offered={offered} colleagues={colleagues} />

                            {weekPlan.length > 0 ? (
                                <>
                                    <h2 className={sectionTitle}>The week ahead: who opens, closes and drives</h2>
                                    <WeekPlan app={app} rows={weekPlan} />
                                </>
                            ) : null}

                            {sites.length > 0 ? (
                                <>
                                    <h2 className={sectionTitle}>Sites you manage</h2>
                                    {sites.map((site) => (
                                        <section key={site.id} className={`flex flex-wrap items-center gap-3 ${cardCls}`}>
                                            <span className="material-symbols-outlined text-[24px] text-primary">{KIND_ICON[site.kind]}</span>
                                            {/* The name keeps its room; on a phone the buttons go under it. */}
                                            <div className="min-w-[9rem] flex-1">
                                                <p className="truncate text-[14px] font-bold text-on-surface">{site.name}</p>
                                                <p className="text-[11px] text-on-surface-variant">{site.kind_label}</p>
                                            </div>
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <Link href={wr(app, "work.rota", { site: site.id })} className={primaryBtn}>
                                                    {site.has_shifts ? "Shifts and opening" : "Who opens and closes"}
                                                </Link>
                                                {site.has_shifts ? (
                                                    <Link href={wr(app, "work.attendance", { site: site.id })} className={ghostBtn}>
                                                        Attendance
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </section>
                                    ))}
                                </>
                            ) : null}
                        </>
                    ) : null}

                    {tab === "keys" ? (
                        <>
                            {waitingKeys}
                            <h2 className={sectionTitle}>Keys you hold</h2>
                            {keys.length === 0 ? (
                                <p className={`${cardCls} text-[12px] text-on-surface-variant`}>You hold no keys right now.</p>
                            ) : (
                                keys.map((key) => <KeyCard key={key.id} app={app} keyView={key} reasons={reasons} />)
                            )}
                            {siteKeys.length > 0 ? (
                                <>
                                    <h2 className={sectionTitle}>Keys of the sites you manage</h2>
                                    {siteKeys.map((key) => (
                                        <KeyCard key={key.id} app={app} keyView={key} showLog />
                                    ))}
                                </>
                            ) : null}
                        </>
                    ) : null}

                    {tab === "leave" ? <LeavePanel app={app} leave={leave} types={leaveTypes} /> : null}

                    {tab === "rides" ? (
                        <>
                            {rides.length === 0 ? <p className={`${cardCls} text-[12px] text-on-surface-variant`}>You are on no staff ride.</p> : null}
                            {rides.map((ride) => (
                                <RideCard key={ride.id} app={app} ride={ride} />
                            ))}
                            <Link href={wr(app, "work.rides")} className={`block text-center ${cardCls} py-2 text-[12px] font-bold text-primary`}>
                                {app === "delivery" ? "All staff rides" : "All staff rides, or ask for one"}
                            </Link>

                            {app !== "delivery" ? (
                                <form
                                    className={cardCls}
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        area.put(wr(app, "work.home-area"), { preserveScroll: true });
                                    }}
                                >
                                    <h2 className="text-[13px] font-bold text-on-surface">Where staff transport picks you up and drops you</h2>
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
                        </>
                    ) : null}
                </div>
            </div>
        </>
    );
}

WorkIndex.layout = workLayout;
