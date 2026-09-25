/**
 * Centralized TypeScript contracts for the Delivery module
 * (resources/js/Pages/Delivery/**).
 *
 * Mirrors App\Services\DeliveryService.
 */

/** Lifecycle of one delivery run. */
export type DeliveryStatus =
    | "pending"
    | "dispatched"
    | "in_transit"
    | "delivered"
    | "failed"
    | "returned";

export interface DeliveryRun {
    id: number;
    tracking_number: string | null;
    status: DeliveryStatus;
    recipient_name: string | null;
    recipient_phone: string | null;
    delivery_address: string | null;
    courier_name: string | null;
    courier_id: number | null;
    sale_reference: string | null;
    sale_total: number | null;
    notes: string | null;
    failure_reason: string | null;
    scheduled_for: string | null;
    picked_up_at: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    failed_at: string | null;
    created_at: string | null;
    /** Statuses this run may legally move to next, straight from the server. */
    allowed_transitions: DeliveryStatus[];
}

export interface DeliveryMetrics {
    /** Claimed by this courier but not yet collected (still `pending`). */
    assigned: number;
    /** Collected and out of the depot (`dispatched`). */
    picked_up: number;
    in_transit: number;
    delivered_today: number;
    delivered_total: number;
    failed: number;
    open: number;
    /** Runs in the shared pool that nobody has claimed. */
    unassigned: number;
}

export interface Courier {
    id: number;
    name: string;
    email: string;
}

export interface CourierProfile {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_number: string | null;
    role: string | null;
}

export interface Pagination {
    current_page: number;
    last_page: number;
    total: number;
}

export interface Flash {
    success?: string | null;
    error?: string | null;
}

export interface SharedProps {
    flash?: Flash;
}

/* ----------------------------------------------------------
 | Page props
 |----------------------------------------------------------*/

export interface DeliveryDashboardProps extends SharedProps {
    metrics: DeliveryMetrics;
    up_next: DeliveryRun[];
    available_runs: DeliveryRun[];
    courier: Courier;
}

export interface DeliveryRunsProps extends SharedProps {
    deliveries: DeliveryRun[];
    available_runs: DeliveryRun[];
    metrics: DeliveryMetrics;
    filters: { status: string; search: string };
    pagination: Pagination;
}

export interface DeliveryShipmentsProps extends SharedProps {
    shipments: DeliveryRun[];
    metrics: DeliveryMetrics;
    filters: { search: string };
    pagination: Pagination;
}

export interface DeliveryProfileProps extends SharedProps {
    courier: CourierProfile;
    metrics: DeliveryMetrics;
}
