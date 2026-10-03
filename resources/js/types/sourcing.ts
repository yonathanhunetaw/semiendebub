/**
 * Contracts for Pick & Pack — the stage where staff name the exact location
 * each line of a paid order is picked from.
 *
 * Server counterpart: App\Services\Fulfillment\OrderSourcingService.
 *
 * Why it exists: a paid order knows what was sold and which store sold it, but
 * a store holds stock on its shop floor, in its back room, at a remote
 * warehouse and at a hub. Only a fully sourced order moves to "To Deliver", and
 * the Delivery that results originates from the location chosen here.
 */

import type { LocationKind } from "./capacity";

/** One place a line could be picked from, with what it actually holds. */
export interface SourcingOption {
    location_type: string;
    location_id: number;
    kind: LocationKind;
    level_label: string;
    name: string;
    on_hand: number;
    /** True when this location alone can cover the line. */
    sufficient: boolean;
    /** True for a main warehouse: the order arrives later. */
    delayed: boolean;
    promise: string;
}

export interface SourceRef {
    location_type: string;
    location_id: number;
}

export interface PickPackLine {
    id: number;
    store_variant_id: number;
    title: string;
    variant_label: string;
    sku: string | null;
    quantity: number;
    picked_quantity: number;
    unit_price: number;
    line_total: number;
    /** Set once this line has been confirmed. */
    confirmed_source: SourceRef | null;
    /** The nearest location that can cover the line, if any. */
    suggested_source: SourceRef | null;
    options: SourcingOption[];
    is_sourced: boolean;
}

export interface PickPackSale {
    id: number;
    reference: string;
    customer: string | null;
    store_name: string | null;
    total_amount: number;
    payment_status: string;
    fulfillment_stage: string;
    stage_label: string;
    /** The buyer accepted a longer wait for hub-sourced lines at checkout. */
    delay_agreed: boolean;
    sourcing_confirmed_at: string | null;
}

export interface PickPackPlan {
    sale: PickPackSale;
    lines: PickPackLine[];
}

/** A paid order waiting to be sourced. */
export interface PickPackQueueOrder {
    id: number;
    reference: string;
    customer: string;
    line_count: number;
    sourced_count: number;
    total_amount: number;
    delay_agreed: boolean;
    placed_at: string | null;
}
