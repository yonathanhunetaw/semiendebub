import { usePage } from "@inertiajs/react";
import { useLayoutEffect, type RefObject } from "react";
import useHideChromeOnScroll from "./useHideChromeOnScroll";

/**
 * For a fixed bottom nav. Publishes how much of the screen it takes as
 * `--nav-h` on <html> (its rendered height, iPhone inset included, plus `gap`
 * of air above it; 0 while it is `display: none`, e.g. `lg:hidden` on a
 * laptop) and hides it while the user scrolls down.
 *
 * Everything that must clear the nav reads `--nav-h` and `--nav-shown`
 * through the classes in app.css (`nav-pad`, `nav-fill`, `dock-sheet`,
 * `dock-float`), so when the nav slides away a cart total drops to the bottom
 * edge and a full-height page grows into the space.
 */
export default function useBottomNav(ref: RefObject<HTMLElement | null>, gap = 0): void {
    const { url } = usePage();
    useHideChromeOnScroll(url.split("?")[0], undefined, { panes: true });

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const root = document.documentElement;

        const measure = () => {
            const h = el.offsetHeight;
            root.style.setProperty("--nav-h", `${h > 0 ? h + gap : 0}px`);
        };
        measure();

        const observer = new ResizeObserver(measure);
        observer.observe(el);
        // `display: none` from a breakpoint does not always resize the element itself.
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
            root.style.removeProperty("--nav-h");
        };
    }, [ref, gap]);
}
