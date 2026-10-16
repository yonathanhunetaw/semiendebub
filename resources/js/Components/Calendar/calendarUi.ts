import { format, parseISO } from "date-fns";
import type { CalendarEventData, CalendarState, EntryKind, EntryRepeat } from "@/types/calendar";

/** The page's route names for one app: `seller.calendar.feed`… */
export const calendarRoute = (app: string, name: "" | "feed" | "entries.store" | "entries.update" | "entries.destroy" | "entries.complete" | "documents.store" | "documents.add") =>
    name === "" ? `${app}.calendar` : `${app}.calendar.${name}`;

export const KIND_LABEL: Record<EntryKind, string> = {
    reminder: "Reminder",
    bill: "Bill",
    shift: "Shift",
    meeting: "Meeting",
};

export const KIND_ICON: Record<string, string> = {
    reminder: "notifications",
    bill: "receipt_long",
    shift: "badge",
    meeting: "groups",
    delivery: "local_shipping",
    freight: "warehouse",
    transfer: "swap_horiz",
    po_arrival: "inventory",
    supplier_payment: "payments",
    credit_due: "credit_card",
};

export const STATE_LABEL: Record<CalendarState, string> = {
    upcoming: "Coming up",
    done: "Done",
    late: "Late",
    past: "Gone by",
};

export const REPEAT_UNIT: Record<Exclude<EntryRepeat, "none">, [string, string]> = {
    daily: ["day", "days"],
    weekly: ["week", "weeks"],
    monthly: ["month", "months"],
    yearly: ["year", "years"],
};

/** "Every month", "Every 2 weeks until 30 Nov 2026". */
export function repeatLabel(repeat: EntryRepeat, every: number, until: string | null): string | null {
    if (repeat === "none") return null;
    const [one, many] = REPEAT_UNIT[repeat];
    const base = every <= 1 ? `Every ${one}` : `Every ${every} ${many}`;
    return until ? `${base} until ${format(parseDay(until), "d MMM yyyy")}` : base;
}

/** A Y-m-d day in local time (new Date("2026-10-16") would be UTC midnight). */
export function parseDay(day: string): Date {
    const [y, m, d] = day.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function eventStart(e: CalendarEventData): Date {
    return e.all_day ? parseDay(e.start) : parseISO(e.start);
}

/** When it happens, in words: "Fri 16 Oct", "Fri 16 Oct, 09:00 – 10:00". */
export function whenLabel(e: CalendarEventData): string {
    const start = eventStart(e);
    if (e.all_day) {
        const end = e.end ? parseDay(e.end) : null;
        return end && end.getTime() !== start.getTime()
            ? `${format(start, "EEE d MMM")} – ${format(end, "EEE d MMM yyyy")}`
            : format(start, "EEEE d MMMM yyyy");
    }
    const end = e.end ? parseISO(e.end) : null;
    if (!end) return format(start, "EEE d MMM yyyy, HH:mm");
    return start.toDateString() === end.toDateString()
        ? `${format(start, "EEE d MMM yyyy, HH:mm")} – ${format(end, "HH:mm")}`
        : `${format(start, "EEE d MMM, HH:mm")} – ${format(end, "EEE d MMM, HH:mm")}`;
}

export function money(amount: number, currency: string | null): string {
    return `${currency ?? "ETB"} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Open a module link: an Inertia visit on this app, a full load on another subdomain. */
export function sameHost(url: string): boolean {
    try {
        return new URL(url, window.location.href).host === window.location.host;
    } catch {
        return false;
    }
}
