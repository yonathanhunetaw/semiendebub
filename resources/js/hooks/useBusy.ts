import { useState } from "react";
import { router } from "@inertiajs/react";

/**
 * One-click `router` actions (confirm, post, claim) with no form behind them:
 * `busy` is true from the click until the visit finishes, so a double click
 * sends one request. Pair with `disabled={busy}` or SkButton's `loading`.
 */
export function useBusy() {
    const [busy, setBusy] = useState(false);

    const post = (url: string, data: Record<string, unknown> = {}, options: Parameters<typeof router.post>[2] = {}) => {
        if (busy) return;
        router.post(url, data as never, {
            ...options,
            onStart: (visit) => { setBusy(true); options.onStart?.(visit); },
            onFinish: (visit) => { setBusy(false); options.onFinish?.(visit); },
        });
    };

    return { busy, post };
}
