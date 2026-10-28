/**
 * Dates on order and money screens always name the day of the week
 * ("Monday, Oct 12"), so "paid on the 12th" never needs a calendar.
 */

/**
 * The shops' clock (Addis Ababa), sent by the server on every page. Times are
 * shown on it, not on the phone's own clock, so a phone set to another zone
 * still reads the same day and hour as the server and the other screens.
 */
let shopTimeZone: string | undefined;

export function setShopTimeZone(value: unknown): void {
    shopTimeZone = typeof value === "string" && value !== "" ? value : undefined;
}

/** For `toLocale*String(undefined, { timeZone: shopZone(), ... })`. */
export function shopZone(): string | undefined {
    return shopTimeZone;
}

const parse = (value: string | Date | null | undefined): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
};

/** "Monday, Oct 12" (with the year when it is not this year). */
export function dayDate(value: string | Date | null | undefined, fallback = "—"): string {
    const date = parse(value);
    if (!date) return fallback;

    const year = (d: Date) => d.toLocaleDateString("en-US", { timeZone: shopTimeZone, year: "numeric" });

    return date.toLocaleDateString(undefined, {
        timeZone: shopTimeZone,
        weekday: "long",
        month: "short",
        day: "numeric",
        ...(year(date) !== year(new Date()) ? { year: "numeric" } : {}),
    });
}

/** "Monday, Oct 12 · 08:37". */
export function dayDateTime(value: string | Date | null | undefined, fallback = "—"): string {
    const date = parse(value);
    if (!date) return fallback;

    return `${dayDate(date)} · ${date.toLocaleTimeString(undefined, { timeZone: shopTimeZone, hour: "2-digit", minute: "2-digit" })}`;
}

/** How long ago: "5 min", "3 h", "2 d". Null when there is no time. Independent of any timezone. */
export function ageText(value: string | Date | null | undefined): string | null {
    const date = parse(value);
    if (!date) return null;

    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`;

    return `${Math.floor(minutes / (60 * 24))} d`;
}
