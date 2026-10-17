import { Head } from "@inertiajs/react";
import React, { useEffect } from "react";

/**
 * The root domain's /clock/{site}/{token}: what the counter QR opens. Staff
 * sign in to different apps, so pick yours once; next time the phone jumps
 * straight there.
 */

interface Props {
    apps: { app: string; label: string; url: string }[];
}

const REMEMBER = "duka.clock.app";

function remembered(): string | null {
    try {
        return window.localStorage.getItem(REMEMBER);
    } catch {
        return null;
    }
}

export default function ClockRelay({ apps = [] }: Props): React.ReactElement {
    useEffect(() => {
        const pick = apps.find((a) => a.app === remembered());
        if (pick) window.location.replace(pick.url);
    }, [apps]);

    const go = (app: { app: string; url: string }) => {
        try {
            window.localStorage.setItem(REMEMBER, app.app);
        } catch {
            // Private mode: fine, the phone asks again next time.
        }
        window.location.href = app.url;
    };

    return (
        <>
            <Head title="Clock" />
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-container-low px-6 text-center">
                <span className="material-symbols-outlined text-[44px] text-primary">qr_code_scanner</span>
                <h1 className="text-lg font-bold text-on-surface">Which app do you use?</h1>
                <p className="text-[12px] text-on-surface-variant">Your phone remembers the choice.</p>
                <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
                    {apps.map((app) => (
                        <button
                            key={app.app}
                            type="button"
                            onClick={() => go(app)}
                            className="rounded-[999px] bg-primary px-4 py-3 text-sm font-bold text-on-primary active:scale-[0.98]"
                        >
                            {app.label}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}
