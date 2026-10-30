import QrImage from "@/Components/Work/QrImage";
import { workLayout, wr } from "@/Components/Work/workUi";
import type { WorkApp } from "@/types/work";
import { Head, Link } from "@inertiajs/react";
import axios from "axios";
import React, { useEffect, useState } from "react";

/**
 * The counter screen: the live QR everyone else scans to clock in and out.
 * The code changes every minute; a photo of it is useless a few minutes later.
 * Leave it open on a phone or tablet at the counter: the screen is kept awake
 * while this page shows (where the browser allows it), and a code that could
 * not be renewed is hidden rather than left up expired.
 */

interface Code {
    url: string;
    seconds_left: number;
    open: boolean;
}

interface Props {
    app: WorkApp;
    site: { id: number; name: string; kind_label: string };
    code: Code;
}

export default function Counter({ app, site, code: first }: Props): React.ReactElement {
    const [code, setCode] = useState<Code>(first);
    const [left, setLeft] = useState(first.seconds_left);
    // The last renewal failed (signed out, offline): the code on screen has expired.
    const [stale, setStale] = useState(false);

    useEffect(() => {
        const tick = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
        return () => window.clearInterval(tick);
    }, []);

    useEffect(() => {
        if (left > 0) return;
        axios
            .get<Code>(wr(app, "work.sites.counter.code", site.id))
            .then((res) => {
                setCode(res.data);
                setLeft(res.data.seconds_left);
                setStale(false);
            })
            .catch(() => {
                setStale(true);
                setLeft(15);
            });
    }, [left, app, site.id]);

    // Keep the screen on while the counter shows (Wake Lock; ignored where unsupported).
    // The browser drops the lock when the tab is hidden, so take it again on return.
    useEffect(() => {
        type Sentinel = { release: () => Promise<void> };
        const wake = (navigator as Navigator & { wakeLock?: { request: (kind: "screen") => Promise<Sentinel> } }).wakeLock;
        if (!wake) return;
        let lock: Sentinel | null = null;
        const take = () => {
            if (document.visibilityState !== "visible") return;
            wake.request("screen")
                .then((sentinel) => {
                    lock = sentinel;
                })
                .catch(() => undefined);
        };
        take();
        document.addEventListener("visibilitychange", take);
        return () => {
            document.removeEventListener("visibilitychange", take);
            lock?.release().catch(() => undefined);
        };
    }, []);

    return (
        <>
            <Head title={`Counter · ${site.name}`} />

            <div className="flex min-h-screen flex-col items-center bg-surface-container-low px-4 pb-36 pt-6 text-center">
                <h1 className="text-xl font-extrabold tracking-tight text-on-surface">{site.name}</h1>
                <p className="text-[12px] text-on-surface-variant">Scan to clock in or out: with the phone camera, or “Scan the counter QR” in My work.</p>

                {stale ? (
                    <p className="mt-8 rounded-[12px] border border-error/30 bg-error-container/70 px-4 py-3 text-[13px] text-on-error-container">
                        Could not get a new code (signed out, or no connection). Trying again… If it stays, reload this page.
                    </p>
                ) : code.open ? (
                    <>
                        <QrImage value={code.url} size={300} className="mt-5 border-8 border-white shadow-md" />
                        <p className="mt-3 text-[12px] text-outline">New code in {left}s</p>
                    </>
                ) : (
                    <p className="mt-8 rounded-[12px] border border-warning/30 bg-warning-container/70 px-4 py-3 text-[13px] text-on-warning-container">
                        The site is not open. Open it first with the printed QR at the counter.
                    </p>
                )}

                <Link href={wr(app, "work")} className="mt-8 text-[12px] font-bold text-primary">
                    Back to My work
                </Link>
            </div>
        </>
    );
}

Counter.layout = workLayout;
