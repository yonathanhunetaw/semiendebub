import KeyCard from "@/Components/Work/KeyCard";
import { cardCls, ghostBtn, hoursText, inputCls, KIND_ICON, workLayout, wr } from "@/Components/Work/workUi";
import type { CustodyKeyView, DayHours, SiteKind, WorkApp } from "@/types/work";
import { Head, Link } from "@inertiajs/react";
import React, { useState } from "react";

/** The sites this user manages: today's hours and who holds each key. */

interface ManagedSite {
    id: number;
    name: string;
    kind: SiteKind;
    kind_label: string;
    has_shifts: boolean;
    today: DayHours | null;
    key: CustodyKeyView;
}

interface Props {
    app: WorkApp;
    sites?: ManagedSite[];
}

const monthStart = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/** Every managed site's hours for a period, as one CSV (for salaries). */
function HoursDownload({ app }: { app: WorkApp }): React.ReactElement {
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

    return (
        <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link href={wr(app, "work.team")} className={ghostBtn}>
                Team: leave and swaps
            </Link>
            <Link href={wr(app, "work.overtime")} className={ghostBtn}>
                Overtime rules
            </Link>
            <input type="date" className={`${inputCls} w-36`} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className={`${inputCls} w-36`} value={to} onChange={(e) => setTo(e.target.value)} />
            <a href={wr(app, "work.hours.all", { from, to })} className={ghostBtn}>
                Hours (CSV)
            </a>
        </div>
    );
}

export default function SitesIndex({ app, sites = [] }: Props): React.ReactElement {
    return (
        <>
            <Head title="Sites" />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight text-on-surface">Sites</h1>
                    <p className="text-[11px] text-outline">Opening hours and keys of the places you manage.</p>
                    <HoursDownload app={app} />
                </header>

                <div className="mx-auto max-w-2xl space-y-4 px-3.5 pt-3">
                    {sites.length === 0 ? (
                        <p className={`${cardCls} text-[12px] text-on-surface-variant`}>You do not manage any site.</p>
                    ) : null}

                    {sites.map((site) => (
                        <div key={site.id} className="space-y-2">
                            <Link href={wr(app, "work.sites.show", site.id)} className={`flex items-center gap-3 ${cardCls}`}>
                                <span className="material-symbols-outlined text-[24px] text-primary">{KIND_ICON[site.kind]}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-bold text-on-surface">{site.name}</p>
                                    <p className="text-[11px] text-on-surface-variant">
                                        {site.kind_label} · {hoursText(site.today)}
                                        {site.has_shifts ? "" : " · no shifts"}
                                    </p>
                                </div>
                                <span className="material-symbols-outlined text-outline">chevron_right</span>
                            </Link>
                            {site.has_shifts ? (
                                <Link href={wr(app, "work.rota", { site: site.id })} className={`block text-center ${cardCls} py-2 text-[12px] font-bold text-primary`}>
                                    Rota this week
                                </Link>
                            ) : null}
                            <KeyCard app={app} keyView={site.key} />
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

SitesIndex.layout = workLayout;
