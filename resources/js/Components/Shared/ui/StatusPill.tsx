import React from "react";
import { TONES, type Tone } from "./tones";

/**
 * THE status -> tone map, shared by every module. A status means the same
 * color everywhere: waiting on someone = warning, booked / acknowledged =
 * info, moving = primary (the module accent), done = success, stopped or
 * late = error, inert = neutral.
 *
 * Collected from the statuses actually in use: shipments (types/shipment.ts,
 * Components/Shipment/shipmentUi.tsx), replenish transfers (types/shipments.ts,
 * Seller/Shipments/TransferCard), deliveries (types/delivery.ts,
 * Components/Delivery/deliveryUi.tsx), seller order stages
 * (Data/sellerOrderFlow.ts), stock-keeper transfers and stock rows
 * (types/stockkeeper.ts), purchase orders (types/vendor.ts), refills
 * (types/sellerLocations.ts), party agreements, manifest coverage and
 * storefront stock status. Where two screens disagreed (e.g. `dispatched`,
 * `scheduled`), the shipment workflow's choice won.
 */
export const STATUS_TONES: Readonly<Record<string, Tone>> = {
    // Inert / not started
    draft: "neutral",
    returned: "neutral",
    inactive: "neutral",
    archived: "neutral",
    closed: "neutral",
    regular: "neutral",
    sold: "neutral",

    // Waiting on someone
    pending: "warning",
    pending_agreement: "warning",
    to_pay: "warning",
    unpaid: "warning",
    picking: "warning",
    ready: "warning",
    rescheduled: "warning",
    partial: "warning",
    low: "warning",
    low_stock: "warning",

    // Booked / acknowledged
    scheduled: "info",
    dispatched: "info",
    paid: "info",
    packing: "info",
    approved: "info",
    in_progress: "info",
    processing: "info",

    // Moving
    in_transit: "primary",
    en_route: "primary",
    to_deliver: "primary",
    out_for_delivery: "primary",

    // Done
    delivered: "success",
    received: "success",
    shipped: "success",
    completed: "success",
    fulfilled: "success",
    accepted: "success",
    created: "success",
    active: "success",
    healthy: "success",
    in_stock: "success",
    ok: "success",

    // Stopped or late
    cancelled: "error",
    canceled: "error",
    failed: "error",
    rejected: "error",
    overdue: "error",
    expired: "error",
    critical: "error",
    out_of_stock: "error",
    oos: "error",
};

/** Labels that differ from the humanised key. */
const STATUS_LABELS: Readonly<Record<string, string>> = {
    pending_agreement: "Awaiting agreement",
    to_pay: "To pay",
    packing: "Pick & pack",
    to_deliver: "To deliver",
    en_route: "En route",
    oos: "Out of stock",
    ok: "In stock",
};

/** The tone for a status key; unknown statuses are neutral. */
export function statusTone(status: string): Tone {
    return STATUS_TONES[status.toLowerCase()] ?? "neutral";
}

/** "in_transit" -> "In transit", with the overrides above. */
export function statusLabel(status: string): string {
    const key = status.toLowerCase();
    if (STATUS_LABELS[key]) return STATUS_LABELS[key];
    const words = key.replace(/[_-]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Literal class strings so the JIT compiler keeps them. */
const SIZES = {
    md: "px-2 py-0.5",
    sm: "px-1.5 py-0.5 tracking-wide",
    xs: "px-1.5",
} as const;

export type StatusPillSize = keyof typeof SIZES;

export interface StatusPillProps {
    /** A status key from STATUS_TONES (any case); sets tone and label. */
    status?: string;
    /** Overrides the label derived from `status`. */
    label?: React.ReactNode;
    /** Overrides the tone derived from `status`. */
    tone?: Tone;
    /** Optional leading Material Symbols icon. */
    icon?: string;
    /** Greyed "not available" look ("Soon"); ignores tone. */
    muted?: boolean;
    size?: StatusPillSize;
    className?: string;
}

/**
 * A small uppercase pill. Pass a `status` for the shared status colors, or a
 * `label` + `tone` for anything else ("Preview", "Soon").
 */
export function StatusPill({
    status,
    label,
    tone,
    icon,
    muted = false,
    size = "md",
    className = "",
}: StatusPillProps): React.ReactElement {
    const resolvedTone = tone ?? (status ? statusTone(status) : "neutral");
    const text = label ?? (status ? statusLabel(status) : null);
    const colors = muted ? "bg-surface-container text-on-surface-variant/60" : TONES[resolvedTone].pill;

    return (
        <span
            className={`rounded-[999px] text-[9px] font-bold uppercase ${SIZES[size]} ${colors} ${
                icon ? "inline-flex items-center gap-0.5" : ""
            } ${className}`}
        >
            {icon ? <span className="material-symbols-outlined text-[11px] leading-none">{icon}</span> : null}
            {text}
        </span>
    );
}
