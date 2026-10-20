import { useEffect } from "react";

const DEFAULT_CLASS = "chrome-hidden";
/** Never hide near the top of the page. */
const TOP_ZONE = 80;
/**
 * Show again near the end of the page or pane, so the bar covers the space
 * reserved for it instead of leaving an empty strip. Kept above the tallest
 * bar (about 110px with the iPhone inset), so the space that hiding frees can
 * never pull the page back up by itself.
 */
const BOTTOM_ZONE = 120;
/** Ignore jitter smaller than this many pixels. */
const THRESHOLD = 8;

/** Scrolling inside these (sheets, dialogs, menus) never moves the page chrome. */
const IGNORE = '[role="dialog"], .MuiModal-root, .MuiPopover-root';

interface Options {
    /**
     * Also follow panes that scroll on their own (Categories, the calendar),
     * not just the window.
     */
    panes?: boolean;
}

/**
 * Toggles `chrome-hidden` (or `className`) on <html> while the user scrolls
 * down and removes it on scroll up, near the top or bottom, or when
 * `resetKey` changes (a new page). The CSS in app.css slides the bars away and
 * moves whatever is docked above the bottom bar down to the edge.
 */
export default function useHideChromeOnScroll(resetKey: string, CLASS: string = DEFAULT_CLASS, { panes = false }: Options = {}): void {
    useEffect(() => {
        const root = document.documentElement;
        const last = new WeakMap<object, number>();
        let pending: Element | Document | null = null;
        let frame = 0;

        root.classList.remove(CLASS);

        const update = () => {
            frame = 0;
            const source = pending;
            pending = null;
            if (!source) return;

            const box = source instanceof Document ? source.scrollingElement ?? root : source;
            const y = box.scrollTop;
            const prev = last.get(source) ?? y;
            const delta = y - prev;
            const fromEnd = box.scrollHeight - box.clientHeight - y;

            if (y < TOP_ZONE || fromEnd < BOTTOM_ZONE) {
                root.classList.remove(CLASS);
            } else if (Math.abs(delta) >= THRESHOLD) {
                root.classList.toggle(CLASS, delta > 0);
            } else {
                if (!last.has(source)) last.set(source, y);
                return;
            }
            last.set(source, y);
        };

        const onScroll = (event: Event) => {
            const target = event.target;
            if (target instanceof Element && target.closest(IGNORE)) return;
            if (!(target instanceof Document) && !(target instanceof Element)) return;
            pending = target;
            if (!frame) frame = window.requestAnimationFrame(update);
        };

        // Capture sees scrolls inside panes too; without `panes` only the page counts.
        const listener = panes ? onScroll : (event: Event) => event.target instanceof Document && onScroll(event);
        document.addEventListener("scroll", listener, { passive: true, capture: true });
        return () => {
            document.removeEventListener("scroll", listener, { capture: true });
            if (frame) window.cancelAnimationFrame(frame);
            root.classList.remove(CLASS);
        };
    }, [resetKey, CLASS, panes]);
}
