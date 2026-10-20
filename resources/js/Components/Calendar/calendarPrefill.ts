/**
 * What the calendar hands a module's form when someone starts something from a
 * day: `?new=1&date=2026-10-24&time=09:00` (the shops' wall clock). The form
 * opens itself when `open` is true and fills its date (and time) in. Anything
 * malformed is ignored, so a hand-typed URL can't break the form.
 */
export interface CalendarPrefill {
    open: boolean;
    date: string | null;
    time: string | null;
}

export const NO_PREFILL: CalendarPrefill = { open: false, date: null, time: null };

export function calendarPrefill(): CalendarPrefill {
    if (typeof window === "undefined") return NO_PREFILL;

    const params = new URLSearchParams(window.location.search);
    const date = params.get("date");
    const time = params.get("time");

    return {
        open: params.get("new") === "1",
        date: date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        time: time !== null && /^\d{2}:\d{2}$/.test(time) ? time : null,
    };
}

/** "Sat 24 Oct" for a "2026-10-24" date (no time, no time zone shift). */
export function dayLabel(day: string): string {
    const [y, m, d] = day.slice(0, 10).split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(y, m - 1, d));
}

/** "2026-10-24T09:00" for a datetime-local input, or "" (time defaults to `fallbackTime`). */
export function prefillDateTime(prefill: CalendarPrefill, fallbackTime = "09:00"): string {
    return prefill.date === null ? "" : `${prefill.date}T${prefill.time ?? fallbackTime}`;
}
