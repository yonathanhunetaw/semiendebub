import RideCard from "@/Components/Work/RideCard";
import { calendarPrefill, type CalendarPrefill } from "@/Components/Calendar/calendarPrefill";
import { cardCls, inputCls, primaryBtn, sectionTitle, workLayout, wr } from "@/Components/Work/workUi";
import type { RideView, WorkApp } from "@/types/work";
import { Head, Link, useForm, usePage } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Staff transport. Drivers (delivery app) see rides nobody has taken and
 * their own. Everyone else sees rides they are on or manage; a manager, or
 * the day's opener or closer, asks for one.
 */

interface RideSite {
    id: number;
    name: string;
    closes_at: string | null;
    people: { id: number; name: string; home_area: string | null }[];
    in_now: number[];
}

interface Props {
    app: WorkApp;
    driver: boolean;
    rides?: RideView[];
    vehicles?: { id: number; name: string; plate: string; key_holder_id: number | null }[];
    sites?: RideSite[];
}

/**
 * When the ride leaves: the site's closing time today, or (started from a day
 * on the calendar) that day at the picked time, else at the site's closing time.
 */
function departsAt(site: RideSite | undefined, prefill: CalendarPrefill): string {
    if (prefill.date === null) return site?.closes_at ?? "";

    return `${prefill.date}T${prefill.time ?? site?.closes_at?.slice(11, 16) ?? "18:00"}`;
}

function RequestForm({ app, sites }: { app: WorkApp; sites: RideSite[] }): React.ReactElement {
    const [prefill] = useState(calendarPrefill);
    const formRef = React.useRef<HTMLFormElement>(null);
    const [siteId, setSiteId] = useState<number>(sites[0]?.id ?? 0);
    const site = sites.find((s) => s.id === siteId) ?? sites[0];
    const form = useForm<{ departs_at: string; rider_ids: number[]; note: string }>({
        departs_at: departsAt(site, prefill),
        rider_ids: site?.in_now ?? [],
        note: "",
    });

    // Started from the calendar: bring the form into view.
    React.useEffect(() => {
        if (prefill.open) formRef.current?.scrollIntoView({ block: "center" });
    }, [prefill.open]);

    const pick = (id: number) => {
        const next = sites.find((s) => s.id === id);
        setSiteId(id);
        form.setData({ departs_at: departsAt(next, prefill), rider_ids: next?.in_now ?? [], note: form.data.note });
    };

    const toggle = (id: number) =>
        form.setData("rider_ids", form.data.rider_ids.includes(id) ? form.data.rider_ids.filter((r) => r !== id) : [...form.data.rider_ids, id]);

    if (!site) return <></>;

    return (
        <form
            ref={formRef}
            className={cardCls}
            onSubmit={(e) => {
                e.preventDefault();
                form.post(wr(app, "work.rides.store", site.id), { preserveScroll: true, onSuccess: () => form.setData("note", "") });
            }}
        >
            <h2 className="text-[13px] font-bold text-on-surface">Ask for a ride</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
                {sites.length > 1 ? (
                    <select className={`${inputCls} col-span-2`} value={site.id} onChange={(e) => pick(Number(e.target.value))}>
                        {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                                From {s.name}
                            </option>
                        ))}
                    </select>
                ) : null}
                <input
                    type="datetime-local"
                    className={`${inputCls} col-span-2`}
                    value={form.data.departs_at}
                    onChange={(e) => form.setData("departs_at", e.target.value)}
                    required
                />
            </div>
            <p className="mt-3 text-[11px] text-on-surface-variant">Who rides (those clocked in are ticked):</p>
            <ul className="mt-1 space-y-1">
                {site.people.map((person) => (
                    <li key={person.id}>
                        <label className="flex items-center gap-2 text-[12px] text-on-surface">
                            <input type="checkbox" checked={form.data.rider_ids.includes(person.id)} onChange={() => toggle(person.id)} />
                            {person.name}
                            <span className="text-on-surface-variant">· {person.home_area ?? "drop-off not set"}</span>
                        </label>
                    </li>
                ))}
            </ul>
            <input className={`${inputCls} mt-2`} placeholder="Note for the driver (optional)" value={form.data.note} onChange={(e) => form.setData("note", e.target.value)} />
            {Object.values(form.errors).map((m) => (
                <p key={m} className="mt-1 text-[11px] text-error">
                    {m}
                </p>
            ))}
            <button type="submit" className={`mt-3 ${primaryBtn}`} disabled={form.processing || form.data.rider_ids.length === 0}>
                Ask for the ride
            </button>
        </form>
    );
}

export default function Rides({ app, driver, rides = [], vehicles = [], sites = [] }: Props): React.ReactElement {
    const me = (usePage().props as { auth?: { user?: { id: number } } }).auth?.user?.id;
    const mine = rides.filter((r) => r.can.drive);
    const pool = rides.filter((r) => !r.can.drive);

    return (
        <>
            <Head title="Staff rides" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <Link href={wr(app, "work")} className="material-symbols-outlined text-on-surface-variant">
                        arrow_back
                    </Link>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-on-surface">Staff rides</h1>
                        <p className="text-[11px] text-outline">{driver ? "Take staff home in a fleet car." : "A fleet car taking staff home."}</p>
                    </div>
                </header>

                <div className="mx-auto max-w-2xl space-y-3 px-3.5 pt-3">
                    {!driver && sites.length > 0 ? <RequestForm app={app} sites={sites} /> : null}

                    {driver && mine.length > 0 ? (
                        <>
                            <h2 className={sectionTitle}>Your rides</h2>
                            {mine.map((ride) => (
                                <RideCard key={ride.id} app={app} ride={ride} vehicles={vehicles} meId={me} />
                            ))}
                        </>
                    ) : null}

                    <h2 className={sectionTitle}>{driver ? "Waiting for a driver" : "Rides"}</h2>
                    {(driver ? pool : rides).length === 0 ? <p className={`${cardCls} text-[12px] text-on-surface-variant`}>No rides.</p> : null}
                    {(driver ? pool : rides).map((ride) => (
                        <RideCard key={ride.id} app={app} ride={ride} vehicles={vehicles} meId={me} />
                    ))}
                </div>
            </div>
        </>
    );
}

Rides.layout = workLayout;
