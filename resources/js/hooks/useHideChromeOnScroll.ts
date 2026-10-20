import { useEffect } from "react";

const DEFAULT_CLASS = "chrome-hidden";
/** Never hide near the top of the page. */
const TOP_ZONE = 80;
/** How far one direction has to run before the chrome changes, so a small wobble never flips it. */
const RUN = 24;
/**
 * After a change, ignore scroll events this long (the slide is 250ms): a pane
 * that grows into the nav's place can nudge its own scroll position, and that
 * must not read as the user scrolling back.
 */
const SETTLE_MS = 350;

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
 * Toggles `chrome-hidden` (or `className`) on <html> once the user has
 * scrolled down a little and removes it once they scroll up a little, near
 * the top, or when `resetKey` changes (a new page). The CSS in app.css slides
 * the bars away and moves whatever is docked above the bottom bar down to the
 * edge. Hiding never changes the page's height, so it cannot bounce itself.
 */
export default function useHideChromeOnScroll(resetKey: string, CLASS: string = DEFAULT_CLASS, { panes = false }: Options = {}): void {
    useEffect(() => {
        const root = document.documentElement;
        // Per scroller: where it was, and how far the current direction has run.
        let marks = new WeakMap<object, { y: number; run: number }>();
        let settleUntil = 0;
        let pending: Element | Document | null = null;
        let frame = 0;

        root.classList.remove(CLASS);

        const set = (hidden: boolean) => {
            if (root.classList.contains(CLASS) === hidden) return;
            root.classList.toggle(CLASS, hidden);
            settleUntil = performance.now() + SETTLE_MS;
            // Start counting afresh from wherever things are once it settles.
            marks = new WeakMap();
        };

        const update = () => {
            frame = 0;
            const source = pending;
            pending = null;
            if (!source) return;

            const box = source instanceof Document ? source.scrollingElement ?? root : source;
            // Clamped, so iOS's rubber band past either end is not a direction.
            const max = Math.max(0, box.scrollHeight - box.clientHeight);
            const y = Math.min(Math.max(box.scrollTop, 0), max);

            if (performance.now() < settleUntil) return;

            const mark = marks.get(source);
            if (!mark) {
                marks.set(source, { y, run: 0 });
                return;
            }

            const delta = y - mark.y;
            mark.y = y;
            if (delta === 0) return;

            // Keep adding while the direction holds; a turn starts a new run.
            mark.run = Math.sign(delta) === Math.sign(mark.run) ? mark.run + delta : delta;

            if (y < TOP_ZONE) set(false);
            else if (mark.run >= RUN) set(true);
            else if (mark.run <= -RUN) set(false);
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
