import SiteDayCard from "@/Components/Work/SiteDayCard";
import { cardCls, clockTime, ghostBtn, inputCls, primaryBtn, workLayout, wr } from "@/Components/Work/workUi";
import type { Person, SiteDayView, TimeEntryView, WorkApp } from "@/types/work";
import { Head, Link, router } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * What the counter QR opens: open or close the site here. The code is sent
 * again with every step, so this page cannot be kept and used from home.
 */

interface Props {
    app: WorkApp;
    token: string;
    /** "printed" | "live" | null (not valid or expired) */
    code: "printed" | "live" | null;
    works_here: boolean;
    site: { id: number; name: string; kind_label: string };
    day: SiteDayView | null;
    key_receivers?: Person[];
    next_opener: { id: number; first_name: string; last_name: string } | null;
    has_shifts: boolean;
    /** Where I am clocked in now, if anywhere. */
    my_entry: TimeEntryView | null;
    /** Others still clocked in here (the closer clocks them out, or they do). */
    still_in?: TimeEntryView[];
}

function Checklist({ items, ticked, onChange }: { items: string[]; ticked: string[]; onChange: (next: string[]) => void }): React.ReactElement {
    return (
        <ul className="space-y-1.5">
            {items.map((item) => (
                <li key={item}>
                    <label className="flex items-center gap-2 text-[13px] text-on-surface">
                        <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={ticked.includes(item)}
                            onChange={(e) => onChange(e.target.checked ? [...ticked, item] : ticked.filter((t) => t !== item))}
                        />
                        {item}
                    </label>
                </li>
            ))}
        </ul>
    );
}

export default function Clock({ app, token, code, works_here, site, day, key_receivers = [], next_opener, has_shifts, my_entry, still_in = [] }: Props): React.ReactElement {
    const [ticked, setTicked] = useState<string[]>([]);
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");
    const [why, setWhy] = useState("");
    const [keyTo, setKeyTo] = useState<string>(next_opener ? String(next_opener.id) : "");
    const [busy, setBusy] = useState(false);
    const [clockOthers, setClockOthers] = useState(false);
    const hereNow = my_entry !== null && my_entry.site?.id === site.id;

    const send = (name: string, data: Record<string, unknown>) => {
        setBusy(true);
        router.post(wr(app, name, site.id), { token, ticked, ...data }, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    const canOpen = day !== null && ["planned", "missed", "closed_day"].includes(day.status);
    const needsNote = day !== null && !day.i_hold_key && day.manages;

    return (
        <>
            <Head title={`At ${site.name}`} />

            <div className="min-h-screen bg-surface-container-low pb-36">
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <h1 className="text-lg font-bold tracking-tight text-on-surface">At {site.name}</h1>
                    <p className="text-[11px] text-outline">{site.kind_label}</p>
                </header>

                <div className="mx-auto max-w-md space-y-3 px-3.5 pt-3">
                    {code === null ? (
                        <p className="rounded-[12px] border border-error/30 bg-error-container/60 px-3 py-2.5 text-[12px] text-on-error-container">
                            This code is not valid, or it has expired. Scan the QR at the counter again.
                        </p>
                    ) : null}

                    {!works_here ? (
                        <p className={`${cardCls} text-[12px] text-on-surface-variant`}>You do not work at this site.</p>
                    ) : null}

                    {day ? <SiteDayCard day={day} app={app} /> : null}

                    {code === "live" && works_here && has_shifts && day?.status === "open" ? (
                        <section className={cardCls}>
                            {hereNow ? (
                                <>
                                    <p className="text-[13px] font-bold text-on-surface">You clocked in at {clockTime(my_entry.clock_in_at)}</p>
                                    <button
                                        type="button"
                                        className={`mt-3 w-full ${primaryBtn} py-2.5`}
                                        disabled={busy}
                                        onClick={() => send("work.clock-out", {})}
                                    >
                                        Clock out
                                    </button>
                                </>
                            ) : my_entry ? (
                                <p className="text-[12px] text-on-surface-variant">
                                    You are clocked in at {my_entry.site?.name} since {clockTime(my_entry.clock_in_at)}. Clock out there first.
                                </p>
                            ) : (
                                <button type="button" className={`w-full ${primaryBtn} py-3 text-sm`} disabled={busy} onClick={() => send("work.clock-in", {})}>
                                    Clock in
                                </button>
                            )}
                        </section>
                    ) : null}

                    {code === "printed" && works_here && has_shifts && day?.status === "open" && !hereNow ? (
                        <p className={`${cardCls} text-[12px] text-on-surface-variant`}>
                            The site is open. To clock in or out, scan the moving code on the counter screen; the printed QR only opens the site.
                        </p>
                    ) : null}

                    {code !== null && day !== null && canOpen ? (
                        <section className={cardCls}>
                            <h2 className="text-[13px] font-bold text-on-surface">Open the site</h2>
                            {!day.i_hold_key && !day.manages ? (
                                <p className="mt-1 text-[12px] text-on-surface-variant">
                                    You do not hold the key. {day.key_holder ? `${day.key_holder.name} holds it` : "Nobody holds it"}: ask
                                    them to hand it to you in My work first.
                                </p>
                            ) : (
                                <div className="mt-2 space-y-3">
                                    <Checklist items={day.opening_items} ticked={ticked} onChange={setTicked} />
                                    <input
                                        className={inputCls}
                                        inputMode="decimal"
                                        placeholder="Cash float in the till (ETB)"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                    />
                                    <input
                                        className={inputCls}
                                        placeholder={needsNote ? "You do not hold the key: how did you open? (required)" : "Note (optional)"}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className={`w-full ${primaryBtn} py-2.5`}
                                        disabled={busy || (needsNote && note.trim() === "")}
                                        onClick={() => send("work.sites.open", { float_amount: amount === "" ? null : Number(amount), note: note || null })}
                                    >
                                        Open {site.name}
                                    </button>
                                </div>
                            )}
                        </section>
                    ) : null}

                    {code !== null && day !== null && day.status === "open" ? (
                        <section className={cardCls}>
                            <h2 className="text-[13px] font-bold text-on-surface">Close the site</h2>
                            <div className="mt-2 space-y-3">
                                <Checklist items={day.closing_items} ticked={ticked} onChange={setTicked} />
                                <input
                                    className={inputCls}
                                    inputMode="decimal"
                                    placeholder="Cash in the till at closing (ETB)"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                                <input
                                    className={inputCls}
                                    placeholder="If the count is not what it should be, say why"
                                    value={why}
                                    onChange={(e) => setWhy(e.target.value)}
                                />
                                {day.i_hold_key ? (
                                    <select className={inputCls} value={keyTo} onChange={(e) => setKeyTo(e.target.value)}>
                                        <option value="">I keep the key</option>
                                        {key_receivers.map((person) => (
                                            <option key={person.id} value={person.id}>
                                                Hand the key to {person.name}
                                                {next_opener?.id === person.id ? " (opens next)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                ) : null}
                                <input className={inputCls} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                                {still_in.length > 0 ? (
                                    <label className="flex items-start gap-2 rounded-[10px] border border-warning/30 bg-warning-container/60 px-2.5 py-2 text-[12px] text-on-warning-container">
                                        <input type="checkbox" className="mt-0.5" checked={clockOthers} onChange={(e) => setClockOthers(e.target.checked)} />
                                        Still clocked in: {still_in.map((e) => e.user?.name).join(", ")}. Clock them out as I close.
                                    </label>
                                ) : null}
                                <button
                                    type="button"
                                    className={`w-full ${primaryBtn} py-2.5`}
                                    disabled={busy || (still_in.length > 0 && !clockOthers)}
                                    onClick={() =>
                                        send("work.sites.close", {
                                            till_count: amount === "" ? null : Number(amount),
                                            note: note || null,
                                            difference_note: why || null,
                                            key_to_id: keyTo ? Number(keyTo) : null,
                                            clock_out_others: clockOthers,
                                        })
                                    }
                                >
                                    Close {site.name}
                                </button>
                                {day.manages || day.i_opened ? (
                                    <Link href={wr(app, "work.sites.counter", site.id)} className={`block text-center ${ghostBtn}`}>
                                        Show the counter screen
                                    </Link>
                                ) : null}
                            </div>
                        </section>
                    ) : null}

                    <Link href={wr(app, "work")} className="block text-center text-[12px] font-bold text-primary">
                        Back to My work
                    </Link>
                </div>
            </div>
        </>
    );
}

Clock.layout = workLayout;
