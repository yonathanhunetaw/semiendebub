import type { RefillSource, RefillStatus } from "@/types/sellerLocations";

/** Where a request stands, worded by the screens (RefillBoard::stage). */
export type RefillStage = "waiting" | "remote_list" | "remote_on_way" | "on_manifest" | "landed" | "cancelled";

/** One Remote Hub or shipment request (RefillBoard::presentLeg). */
export interface RefillRow {
    id: number;
    reference: string;
    item_id: number;
    item_name: string;
    /** The location being refilled: a shelf, or a Remote Hub restocking its own lines. */
    target: { name: string; kind: string } | null;
    source: RefillSource;
    /** For a shipment: lands on the store floor or the Remote Hub. */
    destination: "store" | "remote_hub" | null;
    status: RefillStatus;
    stage: RefillStage;
    urgent: boolean;
    origin: "auto" | "manual";
    /** Units of the leg's pack being sent, named by `unit`. */
    quantity: number;
    /** What was asked for; differs from `quantity` when the manager adjusted it. */
    requested_quantity: number;
    adjusted: boolean;
    unit: string;
    /** The amount being sent, spoken biggest unit first. */
    display: string;
    requested_display: string;
    raised_by: string | null;
    added_by: string | null;
    cancelled_by: string | null;
    transfer: { reference: string; status: string } | null;
    shipment: { id: number; reference: string; status: string; scheduled_for: string | null } | null;
    cancel_reason: string | null;
    created_at: string | null;
    /** What the viewer may do with this row (RefillRequestPolicy). */
    can: { add_to_remote: boolean; add_to_manifest: boolean; update: boolean; cancel: boolean; accept: boolean };
}

/** The store manager's suggestion list (RefillBoard::waitingList). */
export interface RefillWaitingList {
    rows: RefillRow[];
    counts: { pending: number; remote_to_accept: number; in_progress: number; urgent: number };
    hubs: Array<{ id: number; name: string }>;
    /** Where a shipment built here may land: the store floor or its Remote Hub. */
    destinations: Array<{ id: number; name: string; kind: string }>;
    /** May the viewer act on this store's suggestions at all? */
    can_rule: boolean;
}

/** The Replenishment Manifest panel above the shipment builder (RefillBoard::manifestPanel). */
export interface ReplenishmentPanel {
    suggestions: RefillRow[];
    can_add: boolean;
    manifest_open: boolean;
}

/** One floor → shelf transfer waiting to be carried across. */
export interface ShelvingTask {
    transfer_id: number;
    reference: string;
    refill_reference: string | null;
    urgent: boolean;
    item_id: number;
    item_name: string;
    quantity: number;
    display: string;
    status: string;
    created_at: string | null;
}

/** A bin at or below its refill line with nothing on its way. */
export interface ShelvingNeed {
    item_id: number;
    name: string;
    status: "empty" | "critical" | "refill";
    display: string;
    in_unit: number;
    unit: string;
    band: { id: number; max: number; refill: number; critical: number } | null;
}

/** The stock keeper's shelving list (RefillBoard::shelvingList). */
export interface ShelvingBoard {
    shelf: { id: number; name: string } | null;
    remote_hub: { id: number; name: string } | null;
    to_shelve: ShelvingTask[];
    to_accept: RefillRow[];
    needs: ShelvingNeed[];
    /** Requests raised for the store, with what became of each. */
    my_requests: RefillRow[];
    can_shelve: boolean;
    can_raise: boolean;
}

/** One row of the read-only Roles & permissions table (StockPermissions::catalogue). */
export interface PermissionAbility {
    key: string;
    label: string;
    description: string;
    /** The manager tick box that governs it, if any. */
    tick: string | null;
    /** true = may, false = may not, string = may, with that qualifier. */
    who: Record<"seller" | "stock_keeper" | "location_manager" | "store_manager" | "admin", boolean | string>;
}

/** Someone who runs the viewer's store, and their ticks (StockPermissions::peopleOf). */
export interface StorePerson {
    name: string;
    role: "Manager" | "Stock keeper";
    /** "Whole store", "Store Shelf", "Store", "Remote Hub". */
    where: string;
    ticks: string[];
}
