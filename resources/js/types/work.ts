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

/** SiteDayService::present: the day's cash. */
export interface DayCashView {
    /** True once the day is closed: the figures no longer change. */
    final: boolean;
    collected: number;
    /** Taken but not yet confirmed by a second person. */
    unconfirmed: number;
    handed_over: number;
    /** Expenses paid in cash out of the till. */
    paid_out: number;
    /** Opening float + cash taken - cash handed over - cash paid out. */
    expected: number;
    counted: number | null;
    difference: number | null;
    why: string | null;
}

/** SiteDayService::present */
export interface SiteDayView {
    site: { id: number; name: string; kind: SiteKind; kind_label: string };
    id: number;
    date: string;
    status: SiteDayStatus;
    hours: DayHours | null;
    opener: Person | null;
    closer: Person | null;
    /** Brings the opener in and takes the closer home. */
    driver: Person | null;
    /** Opened or closed with no driver planned (or the opener's pick-up never set off). */
    no_driver: boolean;
    /** The driver's two runs from the plan; times are wall-clock "YYYY-MM-DDTHH:mm". */
    rides: { id: number; purpose: RidePurpose; departs_at: string; status: RideView["status"] }[];
    opened_at: string | null;
    opened_by: string | null;
    i_opened: boolean;
    opened_without_key: boolean;
    float_amount: number | null;
    open_note: string | null;
    closed_at: string | null;
    closed_by: string | null;
    /** A manager closed it afterwards; nobody closed it at the counter. */
    closed_late: boolean;
    /** Still open from an earlier date: nobody closed it. */
    overdue_close: boolean;
    till_count: number | null;
    /** A closed day's cash as frozen at closing; an open day's so far (managers only). */
    cash: DayCashView | null;
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
    break_minutes: number;
    worked_minutes: number | null;
    on_break: boolean;
    flags: TimeFlag[];
    note: string | null;
    reviewed: boolean;
    shift: { starts_at: string; ends_at: string } | null;
}

export type LeaveType = "annual" | "sick" | "unpaid" | "other";

/** LeaveService::present */
export interface LeaveView {
    id: number;
    user: Person | null;
    type: LeaveType;
    starts_on: string;
    ends_on: string;
    days: number;
    note: string | null;
    status: "requested" | "approved" | "rejected" | "cancelled";
    decided_by: string | null;
    decision_note: string | null;
}

/** SwapService::present */
export interface SwapView {
    id: number;
    status: "offered" | "taken" | "approved" | "declined" | "rejected" | "cancelled";
    note: string | null;
    decision_note: string | null;
    from: Person | null;
    to: Person | null;
    shift: ShiftView | null;
}

/** StaffRideService::present */
/** A ride made from a site day's plan: the opener's pick-up, or the closer's ride home. */
export type RidePurpose = "opening" | "closing";

export interface RideView {
    id: number;
    site: { id: number; name: string } | null;
    departs_at: string;
    status: "requested" | "claimed" | "departed" | "done" | "cancelled";
    purpose: RidePurpose | null;
    note: string | null;
    driver: Person | null;
    vehicle: { id: number; name: string; plate: string } | null;
    driver_holds_key: boolean;
    /** The fuel recorded for it: an expense finance confirms. */
    fuel: { amount: number; litres: number | null; status: "claimed" | "confirmed" | "rejected"; reject_reason: string | null } | null;
    riders: { id: number; name: string; drop_off: string | null; status: "riding" | "dropped" | "no_show" | "not_riding" }[];
    can: { claim: boolean; drive: boolean; opt_out: boolean; cancel: boolean; fuel: boolean };
}

/** OvertimeService::day */
export interface OvertimeDay {
    user_id: number;
    name: string;
    date: string;
    holiday: string | null;
    worked: number;
    normal: number;
    overtime: number;
    minutes: { day: number; night: number; rest_day: number; holiday: number };
    weighted_hours: number;
    status: "pending" | "approved" | "rejected" | "not_needed";
    paid_minutes: number;
    decided_by: string | null;
    note: string | null;
    can_decide?: boolean;
}
