import { useEffect } from "react";

const CLASS = "seller-chrome-hidden";
/** Never hide near the top of the page. */
const TOP_ZONE = 80;
/** Ignore jitter smaller than this many pixels. */
const THRESHOLD = 8;

/**
 * Toggles `seller-chrome-hidden` on <html> while the user scrolls down and
 * removes it on scroll up, near the top, or when `resetKey` changes (a new
 * page). The CSS in app.css slides the bottom bar and sticky top bar away.
 */
export default function useHideChromeOnScroll(resetKey: string): void {
    useEffect(() => {
        const root = document.documentElement;
        let last = window.scrollY;
        let frame = 0;

        root.classList.remove(CLASS);

        const update = () => {
            frame = 0;
            const y = window.scrollY;
            const delta = y - last;
            if (y < TOP_ZONE) {
                root.classList.remove(CLASS);
            } else if (Math.abs(delta) >= THRESHOLD) {
                root.classList.toggle(CLASS, delta > 0);
            } else {
                return;
            }
            last = y;
        };

        const onScroll = () => {
            if (!frame) frame = window.requestAnimationFrame(update);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame) window.cancelAnimationFrame(frame);
            root.classList.remove(CLASS);
        };
    }, [resetKey]);
}
