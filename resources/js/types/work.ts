/** Keys, sites and (later) shifts and clock-in: App\Services\Workforce\*. */

export type WorkApp = "admin" | "seller" | "stock_keeper" | "delivery";

export interface Person {
    id: number;
    name: string;
}

export type HandoverStatus = "claimed" | "accepted" | "rejected" | "cancelled" | "forced";

export interface KeyHandoverRow {
    id: number;
    status: HandoverStatus;
    reason: string | null;
    note: string | null;
    from: Person | null;
    to: Person | null;
    by: Person | null;
    at: string | null;
    decided_at: string | null;
    key_label: string | null;
}

/** KeyCustodyService::present */
export interface CustodyKeyView {
    id: number;
    label: string;
    kind: "site" | "vehicle";
    holder: Person | null;
    held_since: string | null;
    pending: KeyHandoverRow | null;
    can: { hand_over: boolean; force: boolean; cancel: boolean };
    log: KeyHandoverRow[];
    receivers?: Person[];
}

export interface DayHours {
    closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
    note: string | null;
    exception: boolean;
}

export interface WeekdayHours {
    weekday: number;
    closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
}

export interface SiteHourExceptionRow {
    id: number;
    date: string;
    closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
    note: string | null;
}

export type SiteKind = "store" | "remote_hub" | "main_hub";

export type SiteDayStatus = "planned" | "open" | "closed" | "missed" | "closed_day";

/** SiteDayService::present */
export interface SiteDayView {
    site: { id: number; name: string; kind: SiteKind; kind_label: string };
    id: number;
    date: string;
    status: SiteDayStatus;
    hours: DayHours | null;
    opener: Person | null;
    closer: Person | null;
    opened_at: string | null;
    opened_by: string | null;
    i_opened: boolean;
    opened_without_key: boolean;
    float_amount: number | null;
    open_note: string | null;
    closed_at: string | null;
    closed_by: string | null;
    till_count: number | null;
    close_note: string | null;
    open_checklist: { item: string; done: boolean }[];
    close_checklist: { item: string; done: boolean }[];
    opening_items: string[];
    closing_items: string[];
    key_holder: Person | null;
    i_hold_key: boolean;
    manages: boolean;
}

export type ShiftStatus = "draft" | "published" | "accepted" | "change_requested" | "cancelled";
export type ShiftDuty = "none" | "opener" | "closer";

/** RotaService::present. Times are wall-clock "YYYY-MM-DDTHH:mm" (no zone). */
export interface ShiftView {
    id: number;
    site: { id: number; name: string } | null;
    user: Person | null;
    date: string;
    starts_at: string;
    ends_at: string;
    duty: ShiftDuty;
    status: ShiftStatus;
    change_note: string | null;
}

export interface CoverageGap {
    date: string;
    from: string;
    to: string;
    role: "seller" | "stock_keeper" | "any";
    have: number;
    need: number;
}

export interface StaffingRuleRow {
    weekdays: number[];
    starts_at: string;
    ends_at: string;
    role: "seller" | "stock_keeper" | "any";
    min_people: number;
}

export type TimeFlag = "late" | "early_leave" | "unscheduled" | "auto_closed" | "fixed";

/** AttendanceService::present */
export interface TimeEntryView {
    id: number;
    user: Person | null;
    site: { id: number; name: string } | null;
    clock_in_at: string;
    clock_out_at: string | null;
    in_method: string;
    out_method: string | null;
    minutes: number | null;
    flags: TimeFlag[];
    note: string | null;
    reviewed: boolean;
    shift: { starts_at: string; ends_at: string } | null;
}
