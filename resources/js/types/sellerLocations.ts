/** One tier of the seller's location strip (SellerLocationBoard::strip). */
export interface LocationTile {
    key: string;
    label: string;
    caption: string;
    /** Material Symbols ligature name. */
    icon: string;
    /** Null when the store has no such tier (only Main Store has a Remote Hub). */
    location_id: number | null;
    /** Shelf lines at or below their refill line. */
    alert: number;
    /** Stock held there, in the smallest unit (pieces). */
    pieces: number;
}

/** One line of the shelf replenishment row (SellerLocationBoard::shelfLines). */
export interface ShelfLine {
    id: number;
    name: string;
    variant: string;
    unit: string;
    on_hand: number;
    min: number;
    max: number;
    /** on_hand / max, 0..1. */
    fill: number;
    /** Units needed to top the shelf back up to max. */
    refill: number;
    status: "ok" | "refill" | "empty";
}

/** An item held at a location (ItemStockReader::paginateItems rows). */
export interface LocationItem {
    item_id: number;
    product_name: string;
    item_sku: string | null;
    variant_count: number;
    pieces: number;
    display: string;
    status: string;
}

/** One bin of the shelf matrix (ShelfMatrix::bin): one item, all its pack variants. */
export interface ShelfBin {
    coord: string;
    item_id: number;
    name: string;
    short: string;
    /** Shelf stock in pieces, across every pack variant of the item. */
    pieces: number;
    /** The same, spoken biggest unit first: "40 Packets · 35 Pieces". */
    display: string;
    /** Shelf stock in the band's unit. */
    in_unit: number;
    unit: { id: number | null; name: string; pieces: number };
    units: Array<{ id: number | null; name: string; pieces: number }>;
    band: { id: number; max: number; refill: number; critical: number } | null;
    max_pieces: number;
    fill: number;
    status: "empty" | "critical" | "refill" | "ok";
    /** False = stock on the shelf for an item with no bin: shown as unassigned, never refilled. */
    assigned: boolean;
    /** Open refill legs for the item at this store (RefillRequest), urgent first. */
    refills: ShelfRefillLeg[];
    /** Where the store refills this item from, in order. */
    route: RefillSource[];
}

/** floor = store floor → shelf; remote_hub = Remote Hub → floor; shipment = Hub A/B → floor. */
export type RefillSource = "floor" | "remote_hub" | "shipment";

export type RefillStatus = "pending" | "approved" | "in_progress" | "fulfilled" | "cancelled";

/** One leg of a shelf refill (ShelfMatrix::withRefills). */
export interface ShelfRefillLeg {
    id: number;
    reference: string;
    source: RefillSource;
    destination: "store" | "remote_hub" | null;
    status: RefillStatus;
    /** On the Remote Hub list, not yet accepted by the hub. */
    awaits_hub: boolean;
    requested_quantity: number;
    urgent: boolean;
    /** Units of the leg's own pack variant. */
    quantity: number;
    /** The same, spoken biggest unit first. */
    display: string;
}

/** An item a shelf manager may assign to a bin (LocationController::assignable). */
export interface AssignableItem {
    id: number;
    name: string;
    units: Array<{ id: number | null; name: string; pieces: number }>;
}

export interface ShelfMatrixData {
    tier: number;
    tiers: number;
    columns: string[];
    rows: number;
    bins: ShelfBin[];
    totals: {
        items: number;
        occupied: number;
        pieces: number;
        banded: number;
        refill_queue: number;
        critical: number;
        unassigned: number;
        refill_pending: number;
    };
}
