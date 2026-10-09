import { useEffect, useRef, useState } from "react";

/**
 * A number that counts to its new value instead of jumping, so a live figure
 * visibly changes when the dashboard refreshes. Jumps straight there for
 * people who asked for less motion.
 */
export function useCountUp(target: number, duration = 900): number {
    const [shown, setShown] = useState(target);
    const from = useRef(target);
    const first = useRef(true);

    useEffect(() => {
        const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        // Count up from zero on first paint, from the last value afterwards.
        const start = first.current ? 0 : from.current;
        first.current = false;

        if (reduce || start === target) {
            setShown(target);
            from.current = target;
            return;
        }

        let frame = 0;
        const began = performance.now();
        const step = (now: number) => {
            const t = Math.min(1, (now - began) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setShown(start + (target - start) * eased);
            if (t < 1) frame = requestAnimationFrame(step);
            else from.current = target;
        };
        frame = requestAnimationFrame(step);

        return () => cancelAnimationFrame(frame);
    }, [target, duration]);

    return shown;
}
