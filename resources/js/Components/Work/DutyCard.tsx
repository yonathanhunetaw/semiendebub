import { dayDate } from "@/utils/dates";
import type { DutyKind, DutyView, RideView, WorkApp } from "@/types/work";
import { Link, router } from "@inertiajs/react";
import React, { useState } from "react";
import CounterScan from "./CounterScan";
import RideCard from "./RideCard";
import { cardCls, ghostBtn, hm, inputCls, KIND_ICON, primaryBtn, wr } from "./workUi";

interface Props {
    app: WorkApp;
    duty: DutyView;
    /** My planned runs (full rides), to show the ones of this day. */
    driving?: RideView[];
    vehicles?: { id: number; name: string; plate: string; key_holder_id: number | null }[];
    meId?: number;
}

/** One step: done (a tick) or still to do (a number). */
function Step({ n, done, children }: { n: number; done?: boolean; children: React.ReactNode }): React.ReactElement {
    return (
        <li className="flex gap-2.5">
            <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-success text-on-success" : "bg-primary-container text-on-primary-container"}`}
            >
                {done ? <span className="material-symbols-outlined text-[14px]">check</span> : n}
            </span>
            <div className={`min-w-0 flex-1 text-[12px] ${done ? "text-on-surface-variant" : "text-on-surface"}`}>{children}</div>
        </li>
    );
}

const ROLE_TEXT: Record<DutyKind, string> = { opener: "open", closer: "close", driver: "drive" };
const DUTY_NAME: Record<DutyKind, string> = { opener: "Opening", closer: "Closing", driver: "Driving" };

/**
 * "Will you do it?": yes, or no with a reason. The manager sees the answer on
 * the Rota and the week ahead, and a "no" in their bell. It can be changed
 * until the job is done.
 */
function Answer({ app, duty, kind, label }: { app: WorkApp; duty: DutyView; kind: DutyKind; label: boolean }): React.ReactElement {
    const given = duty.answers[kind];
    const [editing, setEditing] = useState(given === null);
    const [saying, setSaying] = useState(false);
    const [why, setWhy] = useState("");
    const [busy, setBusy] = useState(false);
    const send = (answer: "yes" | "no") => {
        setBusy(true);
        router.post(wr(app, "work.site-days.answer", duty.id), { duty: kind, answer, note: answer === "no" ? why : null }, {
            preserveScroll: true,
            onSuccess: () => {
                setEditing(false);
                setSaying(false);
            },
            onFinish: () => setBusy(false),
        });
    };
    const prefix = label ? `${DUTY_NAME[kind]}: ` : "";

    if (!editing && given) {
        return (
            <p className={`flex flex-wrap items-center gap-x-2 text-[12px] ${given.answer === "yes" ? "text-on-success-container" : "text-on-error-container"}`}>
                <span className="font-bold">
                    {prefix}
                    {given.answer === "yes" ? "✓ You said you will" : `✗ You said you can’t: “${given.note ?? ""}”. The manager picks someone else.`}
                </span>
                <button type="button" className="text-[11px] font-bold text-primary" onClick={() => setEditing(true)}>
                    Change
                </button>
            </p>
        );
    }

    return (
        <div className="rounded-[12px] border border-primary/30 bg-primary-container/20 p-2.5">
            <p className="text-[12px] font-bold text-on-surface">{prefix}Can you do it?</p>
            {saying ? (
                <div className="mt-2 space-y-2">
                    <input className={inputCls} placeholder="Why not? (the manager sees this)" value={why} onChange={(e) => setWhy(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={primaryBtn} disabled={busy || why.trim() === ""} onClick={() => send("no")}>
                            Tell the manager
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setSaying(false)}>
                            Back
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={primaryBtn} disabled={busy} onClick={() => send("yes")}>
                        Yes, I’ll do it
                    </button>
                    <button type="button" className={ghostBtn} disabled={busy} onClick={() => setSaying(true)}>
                        I can’t…
                    </button>
                    {given ? (
                        <button type="button" className="text-[11px] font-bold text-on-surface-variant" onClick={() => setEditing(false)}>
                            Keep my answer
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
}

/**
 * A day I open, close or drive, as steps to do: get the key, scan the counter
 * QR, count the till, take the car. Today's steps have their buttons; a later
 * day says what is coming. The plan itself is set on the Rota.
 */
export default function DutyCard({ app, duty, driving = [], vehicles = [], meId }: Props): React.ReactElement {
    const opens = duty.hours?.opens_at ?? null;
    const closes = duty.hours?.closes_at ?? null;
    const when = duty.is_today ? "Today" : dayDate(duty.date);
    const roles = duty.my_roles.map((role) => ROLE_TEXT[role]);
    const title = `You ${roles.length > 1 ? `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}` : roles[0]}`;
    const isOpen = duty.status === "open";
    const runs = driving.filter((ride) => duty.rides.some((planned) => planned.id === ride.id));
    let n = 0;

    // A function, so its number is only taken when the step is shown.
    const keyStep = () => (
        <Step n={++n} done={duty.i_hold_key}>
            {duty.i_hold_key ? (
                "You have the key."
            ) : duty.key_holder ? (
                <>
                    Get the key from <span className="font-bold">{duty.key_holder.name}</span>. They hand it to you in My work; tap “I have it” once it is in your hand.
                </>
            ) : duty.manages ? (
                <>
                    Nobody holds the key.{" "}
                    <Link href={`${wr(app, "work")}?tab=keys`} className="font-bold text-primary">
                        Give it to yourself on Keys
                    </Link>
                    , or open without it and say how.
                </>
            ) : (
                "Nobody holds the key. Ask a manager to give it to you before opening."
            )}
        </Step>
    );

    return (
        <section className={`${cardCls} border-primary/40`}>
            <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[24px] text-primary">{KIND_ICON[duty.site.kind] ?? "storefront"}</span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-on-surface">
                        {title} · {duty.site.name}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                        {when}
                        {opens && closes ? ` · open ${opens}–${closes}` : duty.status === "closed_day" ? " · closed that day" : " · no hours set"}
                        {duty.status === "missed" ? " · late opening" : ""}
                        {isOpen ? " · open now" : ""}
                    </p>
                </div>
            </div>

            <div className="mt-3 space-y-2">
                {duty.my_roles.map((kind) => (
                    <Answer key={kind} app={app} duty={duty} kind={kind} label={duty.my_roles.length > 1} />
                ))}
            </div>

            <ol className="mt-3 space-y-2.5">
                {duty.my_roles.includes("opener") ? (
                    <>
                        {keyStep()}
                        <Step n={++n}>
                            {duty.is_today ? (
                                <>
                                    At the counter{opens ? ` by ${opens}` : ""}, scan the printed QR and open.
                                    <div className="mt-2">
                                        <CounterScan app={app} />
                                    </div>
                                </>
                            ) : (
                                `On the day, scan the printed QR at the counter${opens ? ` by ${opens}` : ""} to open.`
                            )}
                        </Step>
                    </>
                ) : null}

                {duty.my_roles.includes("closer") ? (
                    <>
                        {duty.my_roles.includes("opener") ? null : (
                            <Step n={++n} done={isOpen}>
                                {isOpen ? `Opened by ${duty.opened_by ?? "someone"}.` : `Waits for ${duty.opener?.name ?? "the opener"} to open${opens ? ` at ${opens}` : ""}.`}
                            </Step>
                        )}
                        <Step n={++n}>
                            {isOpen ? (
                                <>
                                    {closes ? `At ${closes}, c` : "C"}ount the till, scan the QR and close. Hand the key to the next opener as you do.
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <CounterScan app={app} label="Scan to close" />
                                        {duty.manages ? (
                                            <Link href={wr(app, "work.sites.counter", duty.site.id)} className={ghostBtn}>
                                                Counter screen
                                            </Link>
                                        ) : null}
                                    </div>
                                </>
                            ) : (
                                `Once it is open, count the till${closes ? ` at ${closes}` : ""} and scan the QR to close.`
                            )}
                        </Step>
                    </>
                ) : null}

                {duty.my_roles.includes("driver") ? (
                    <Step n={++n} done={duty.rides.length > 0 && duty.rides.every((ride) => ride.status === "done")}>
                        {duty.rides.length === 0 ? (
                            "No runs to drive yet: they are made once an opener or closer is named and the time is still ahead."
                        ) : (
                            <>
                                {duty.rides.map((ride) => `${ride.purpose === "opening" ? `Bring ${duty.opener?.name ?? "the opener"} in` : `Take ${duty.closer?.name ?? "the closer"} home`} at ${hm(ride.departs_at)}`).join("; ")}.
                                {duty.is_today ? " Pick the car and take each run below." : ""}
                            </>
                        )}
                    </Step>
                ) : null}
            </ol>

            {duty.my_roles.includes("driver") && runs.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {runs.map((ride) => (
                        <RideCard key={ride.id} app={app} ride={ride} vehicles={vehicles} meId={meId} />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
