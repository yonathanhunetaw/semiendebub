/**
 * The calendar (Pages/Calendar/Index.tsx): what App\Services\Calendar\CalendarFeed
 * sends. Every module's dates and the calendar's own entries share one shape.
 */
export type CalendarApp = "admin" | "seller" | "stock_keeper" | "delivery" | "procurement";

export type CalendarTone = "primary" | "tertiary" | "info" | "success" | "warning" | "error";

/** upcoming · done · late (past, not done) · past (gone by, the module can't tell) */
export type CalendarState = "upcoming" | "done" | "late" | "past";

export type EntryKind = "reminder" | "bill" | "shift" | "meeting";

export type EntryRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export type EntryVisibility = "private" | "shared";

export interface CalendarSourceInfo {
    key: string;
    label: string;
    tone: CalendarTone;
}

/** A calendar entry's own fields, on each of its occurrences. */
export interface CalendarEntryInfo {
    id: number;
    /** The day this occurrence falls on (Y-m-d). */
    occurs_on: string;
    notes: string | null;
    visibility: EntryVisibility;
    store: string | null;
    repeat: EntryRepeat;
    repeat_every: number;
    repeat_until: string | null;
    starts_at: string;
    ends_at: string | null;
    amount: number | null;
    counterparty: string | null;
    created_by: string | null;
    can_edit: boolean;
    /** The receipt it was made from, if any. */
    document_url: string | null;
    completion: { at: string; by: string | null; note: string | null } | null;
}

export interface CalendarEventData {
    id: string;
    source: string;
    kind: string;
    title: string;
    subtitle: string | null;
    /** Y-m-d when all_day, ISO 8601 otherwise. */
    start: string;
    end: string | null;
    all_day: boolean;
    state: CalendarState;
    status: string | null;
    url: string | null;
    amount: number | null;
    currency: string | null;
    entry?: CalendarEntryInfo;
}

/** What the receipt reader made of an upload (App\Services\Documents\ReceiptReading). */
export interface ReceiptReadingData {
    kind: "receipt" | "bill" | "other";
    is_paid: boolean;
    date: string | null;
    date_as_printed: string | null;
    amount: number | null;
    currency: string | null;
    payee: string | null;
    title: string;
    recurring: boolean;
    repeat: Exclude<EntryRepeat, "daily">;
    repeat_every: number;
    summary: string;
}

/** The upload waiting to be checked (`?document=` on the calendar). */
export interface PendingDocument {
    id: number;
    name: string;
    is_image: boolean;
    url: string;
    status: "unread" | "read" | "failed" | "added";
    reading: ReceiptReadingData | null;
    read_error: string | null;
}
