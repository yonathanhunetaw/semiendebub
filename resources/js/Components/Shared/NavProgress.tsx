import React, { useEffect, useRef } from "react";
import { router } from "@inertiajs/react";

/**
 * Show nothing for visits faster than this: most pages open well inside it,
 * so the loaders only come up on the slow ones (Dashboard, Settings → System).
 */
const APPEAR_MS = 400;
/** Safety net: never leave the screen dimmed if an app switch goes nowhere. */
const DIM_GIVE_UP_MS = 20000;

let switchFrom: HTMLElement | null = null;

/**
 * Called by the Apps menu just before it switches apps, with the Apps button
 * that opened it: the dim then keeps a lit copy of that button, spinning.
 */
export function markAppSwitch(el: HTMLElement | null) {
    switchFrom = el;
}

/** Bottom edge of whatever bar is pinned to the top of the screen (0 if none), read once per visit. */
function topBarBottom(): number {
    let bottom = 0;
    for (const start of document.elementsFromPoint(window.innerWidth / 2, 2)) {
        for (let el: Element | null = start; el && el !== document.body; el = el.parentElement) {
            const position = getComputedStyle(el).position;
            if (position !== "fixed" && position !== "sticky") continue;
            const rect = el.getBoundingClientRect();
            if (rect.top <= 1 && rect.bottom < 160) bottom = Math.max(bottom, rect.bottom);
        }
    }
    return bottom;
}

/**
 * Page-load feedback, mounted once in app.tsx. It only says "loading", never
 * how far (the owner's choice):
 *  - a spinning ring in the middle of the screen, in front of the page (the
 *    page stays usable behind it), and a sliding line under the top bar;
 *  - an app switch (POST /impersonate) instead dims the screen and keeps the
 *    Apps button lit above the dim, spinning.
 * Everything spins in CSS, so it keeps turning while the page is busy.
 * Styles are in app.css (`nav-*`); this only toggles classes, so it never
 * re-renders the page.
 */
export default function NavProgress() {
    const line = useRef<HTMLDivElement>(null);
    const dim = useRef<HTMLDivElement>(null);
    const lift = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const html = document.documentElement;
        let active = 0;
        let appear: number | undefined;
        let giveUp: number | undefined;
        let dimmed = false;

        const show = () => {
            if (line.current) line.current.style.top = `${topBarBottom()}px`;
            html.classList.add("nav-loading");
        };

        const liftSwitchButton = () => {
            const box = lift.current;
            if (!box || !switchFrom?.isConnected) return;
            const rect = switchFrom.getBoundingClientRect();
            const copy = switchFrom.cloneNode(true) as HTMLElement;
            copy.removeAttribute("id");
            copy.removeAttribute("tabindex");
            copy.setAttribute("aria-hidden", "true");
            Object.assign(copy.style, { position: "absolute", inset: "0", margin: "0", transform: "none" });
            box.replaceChildren(copy);
            Object.assign(box.style, {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                borderRadius: getComputedStyle(switchFrom).borderRadius,
            });
            box.dataset.visible = "true";
        };

        const begin = (appSwitch: boolean) => {
            active += 1;
            if (appSwitch) {
                window.clearTimeout(appear);
                dimmed = true;
                html.classList.add("nav-switching");
                if (dim.current) dim.current.dataset.visible = "true";
                liftSwitchButton();
                show();
                window.clearTimeout(giveUp);
                giveUp = window.setTimeout(() => end(true), DIM_GIVE_UP_MS);
                return;
            }
            if (active === 1) appear = window.setTimeout(show, APPEAR_MS);
        };

        const end = (force = false) => {
            active = force ? 0 : Math.max(0, active - 1);
            if (active > 0) return;
            window.clearTimeout(appear);
            window.clearTimeout(giveUp);
            dimmed = false;
            switchFrom = null;
            html.classList.remove("nav-loading", "nav-switching");
            if (dim.current) dim.current.dataset.visible = "false";
            if (lift.current) {
                lift.current.dataset.visible = "false";
                lift.current.replaceChildren();
            }
        };

        const isAppSwitch = (url: URL, method: string) => method === "post" && url.pathname === "/impersonate";

        const offs = [
            // Background visits (polls, router.reload, deferred props, prefetch) say
            // showProgress: false; they never show a loader, as with Inertia's own bar.
            router.on("start", (event) => {
                if (!event.detail.visit.showProgress) return;
                begin(isAppSwitch(event.detail.visit.url, event.detail.visit.method));
            }),
            // An app switch usually answers with an external redirect: the page then unloads,
            // so keep the dim up through `finish` and clear it only on the next page or an error.
            router.on("finish", (event) => {
                if (!event.detail.visit.showProgress) return;
                if (dimmed && isAppSwitch(event.detail.visit.url, event.detail.visit.method)) {
                    active = Math.max(0, active - 1);
                    return;
                }
                end();
            }),
            // Only an app switch that stays on this host lands here still dimmed.
            router.on("navigate", () => {
                if (dimmed) end(true);
            }),
            router.on("error", () => end(true)),
            router.on("invalid", () => end(true)),
            router.on("exception", () => end(true)),
        ];

        // Full page loads (another app's host, plain links).
        window.addEventListener("beforeunload", show);

        return () => {
            offs.forEach((off) => off());
            window.removeEventListener("beforeunload", show);
            window.clearTimeout(appear);
            window.clearTimeout(giveUp);
            html.classList.remove("nav-loading", "nav-switching");
        };
    }, []);

    return (
        <>
            <div ref={dim} className="nav-dim" data-visible="false" aria-hidden="true" />
            <div ref={lift} className="nav-lift" data-visible="false" aria-hidden="true" />
            <div ref={line} className="nav-line" aria-hidden="true" />
            <div className="nav-center" role="status" aria-label="Loading page" />
        </>
    );
}
