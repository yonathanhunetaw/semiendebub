/**
 * Dates on order and money screens always name the day of the week
 * ("Monday, Oct 12"), so "paid on the 12th" never needs a calendar.
 */

const parse = (value: string | Date | null | undefined): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
};

/** "Monday, Oct 12" (with the year when it is not this year). */
export function dayDate(value: string | Date | null | undefined, fallback = "—"): string {
    const date = parse(value);
    if (!date) return fallback;

    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });
}

/** "Monday, Oct 12 · 08:37". */
export function dayDateTime(value: string | Date | null | undefined, fallback = "—"): string {
    const date = parse(value);
    if (!date) return fallback;

    return `${dayDate(date)} · ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
