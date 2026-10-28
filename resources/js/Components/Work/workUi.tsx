import FlashToast from "@/Components/Shared/FlashToast";
import { shopZone } from "@/utils/dates";
import AdminLayout from "@/Layouts/AdminLayout";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import SellerLayout from "@/Layouts/SellerLayout";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { HandoverStatus, ShiftDuty, ShiftStatus, TimeFlag, WorkApp } from "@/types/work";
import React from "react";

/** The work pages are one set on four apps; each renders in its app's layout. */
export const WORK_LAYOUTS: Record<WorkApp, React.ComponentType<{ children: React.ReactNode }>> = {
    admin: ({ children }) => <AdminLayout flashToast>{children}</AdminLayout>,
    seller: SellerLayout,
    stock_keeper: StockKeeperLayout,
    // The delivery layout shows no flash of its own (Calendar does the same).
    delivery: ({ children }) => (
        <DeliveryLayout>
            {children}
            <FlashToast />
        </DeliveryLayout>
    ),
};

export function workLayout<P extends { app: WorkApp }>(page: React.ReactElement<P>): React.ReactElement {
    const Layout = WORK_LAYOUTS[page.props.app] ?? WORK_LAYOUTS.admin;
    return <Layout>{page}</Layout>;
}

/** route() for a work route in the current app: wr(app, "work.sites.show", id). */
export function wr(app: WorkApp, name: string, params?: unknown): string {
    return route(`${app}.${name}`, params as never);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const KIND_ICON: Record<string, string> = {
    store: "storefront",
    remote_hub: "warehouse",
    main_hub: "domain",
    vehicle: "local_shipping",
    site: "key",
};

export const HANDOVER_CHIP: Record<HandoverStatus, { label: string; className: string }> = {
    claimed: { label: "Waiting to accept", className: "border-info/30 bg-info-container/60 text-on-info-container" },
    accepted: { label: "Accepted", className: "border-success/30 bg-success-container/60 text-on-success-container" },
    rejected: { label: "Not received", className: "border-error/30 bg-error-container/60 text-on-error-container" },
    cancelled: { label: "Cancelled", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
    forced: { label: "Given by a manager", className: "border-warning/30 bg-warning-container/60 text-on-warning-container" },
};

export const REASON_LABEL: Record<string, string> = {
    shift_change: "Shift change",
    opening: "For opening",
    closing: "After closing",
    return: "Returning it",
    trip: "For a trip",
    other: "Other",
};

export const cardCls = "rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest p-3.5 shadow-sm";
export const primaryBtn =
    "rounded-[999px] bg-primary px-4 py-2 text-xs font-bold text-on-primary active:scale-[0.98] disabled:opacity-50";
export const ghostBtn =
    "rounded-[999px] border border-outline-variant px-4 py-2 text-xs font-bold text-on-surface active:scale-[0.98] disabled:opacity-50";
export const inputCls =
    "w-full rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] text-on-surface";

export function hoursText(today: { closed: boolean; opens_at: string | null; closes_at: string | null } | null): string {
    if (today === null) return "Hours not set";
    if (today.closed) return "Closed today";
    return `${today.opens_at} – ${today.closes_at}`;
}

export const SHIFT_CHIP: Record<ShiftStatus, { label: string; className: string }> = {
    draft: { label: "Draft", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
    published: { label: "Not accepted yet", className: "border-info/30 bg-info-container/60 text-on-info-container" },
    accepted: { label: "Accepted", className: "border-success/30 bg-success-container/60 text-on-success-container" },
    change_requested: { label: "Change asked", className: "border-warning/30 bg-warning-container/60 text-on-warning-container" },
    cancelled: { label: "Cancelled", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
};

export const DUTY_LABEL: Record<ShiftDuty, string> = { none: "", opener: "Opens", closer: "Closes" };

export const ROLE_LABEL: Record<string, string> = { seller: "sellers", stock_keeper: "stock keepers", any: "people" };

/** "2026-10-19T08:30" → "08:30" */
export const hm = (wallClock: string): string => wallClock.slice(11, 16);

export const FLAG_CHIP: Record<TimeFlag, { label: string; className: string }> = {
    late: { label: "Late", className: "border-warning/30 bg-warning-container/60 text-on-warning-container" },
    early_leave: { label: "Left early", className: "border-warning/30 bg-warning-container/60 text-on-warning-container" },
    unscheduled: { label: "No shift", className: "border-info/30 bg-info-container/60 text-on-info-container" },
    auto_closed: { label: "Nobody clocked out", className: "border-error/30 bg-error-container/60 text-on-error-container" },
    fixed: { label: "Fixed", className: "border-outline-variant bg-surface-container text-on-surface-variant" },
};

/** 435 → "7 h 15 min" */
export const duration = (minutes: number | null): string =>
    minutes === null ? "still in" : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

/** An ISO instant → "HH:mm" in the browser's time. */
export const clockTime = (iso: string | null): string =>
    iso === null ? "—" : new Date(iso).toLocaleTimeString([], { timeZone: shopZone(), hour: "2-digit", minute: "2-digit", hour12: false });

export const LEAVE_LABEL: Record<string, string> = { annual: "Annual leave", sick: "Sick", unpaid: "Unpaid leave", other: "Other leave" };

export const STATUS_CHIP: Record<string, string> = {
    requested: "border-info/30 bg-info-container/60 text-on-info-container",
    offered: "border-info/30 bg-info-container/60 text-on-info-container",
    taken: "border-warning/30 bg-warning-container/60 text-on-warning-container",
    claimed: "border-info/30 bg-info-container/60 text-on-info-container",
    departed: "border-warning/30 bg-warning-container/60 text-on-warning-container",
    approved: "border-success/30 bg-success-container/60 text-on-success-container",
    done: "border-success/30 bg-success-container/60 text-on-success-container",
    rejected: "border-error/30 bg-error-container/60 text-on-error-container",
    declined: "border-error/30 bg-error-container/60 text-on-error-container",
    cancelled: "border-outline-variant bg-surface-container text-on-surface-variant",
};

export const STATUS_LABEL: Record<string, string> = {
    requested: "Waiting",
    offered: "Offered",
    taken: "Taken, manager to approve",
    claimed: "Driver found",
    departed: "On the way",
    approved: "Approved",
    done: "Done",
    rejected: "Turned down",
    declined: "Declined",
    cancelled: "Cancelled",
};

export function Chip({ status }: { status: string }): React.ReactElement {
    return (
        <span className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP[status] ?? STATUS_CHIP.cancelled}`}>
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

export const sectionTitle = "px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant";
