import BarcodeScannerDialog from "@/Components/Seller/BarcodeScannerDialog";
import type { WorkApp } from "@/types/work";
import { router } from "@inertiajs/react";
import React, { useState } from "react";
import { primaryBtn, wr } from "./workUi";

/** The site and token from a counter QR (CounterQr::url: https://<domain>/clock/{site}/{token}). */
export function parseCounterQr(text: string): { site: number; token: string } | null {
    const match = text.match(/\/clock\/(\d+)\/([^/?#\s]+)/);

    return match ? { site: Number(match[1]), token: match[2] } : null;
}

/**
 * "Scan the counter QR" without leaving the app: the camera opens here and a
 * counter code goes straight to this app's counter page (open, close, clock
 * in or out), skipping the root domain's "which app?" step.
 */
export default function CounterScan({ app, label = "Scan the counter QR", className = primaryBtn }: { app: WorkApp; label?: string; className?: string }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    return (
        <>
            <button
                type="button"
                className={`inline-flex items-center gap-1.5 ${className}`}
                onClick={() => {
                    setProblem(null);
                    setOpen(true);
                }}
            >
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                {label}
            </button>
            <BarcodeScannerDialog
                open={open}
                title="Scan the counter QR"
                onClose={() => setOpen(false)}
                onScan={(text) => {
                    const code = parseCounterQr(text);
                    if (code === null) {
                        setProblem("That is not a counter QR. Scan the printed QR, or the moving one on the counter screen.");
                        return;
                    }
                    setOpen(false);
                    router.visit(wr(app, "work.clock", { site: code.site, token: code.token }));
                }}
            >
                <p className="mt-2 text-[12px] text-on-surface-variant">
                    The printed QR opens the site; the moving code on the counter screen clocks you in and out. Either one closes it.
                </p>
                {problem ? <p className="mt-1 text-[12px] font-semibold text-error">{problem}</p> : null}
            </BarcodeScannerDialog>
        </>
    );
}
