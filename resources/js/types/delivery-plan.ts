/**
 * Delivery choices at checkout and on To pay
 * (OrderBoardController::deliveryOptions, SellerOrderService::arrange).
 */

export interface CourierOption {
    id: number;
    name: string;
    phone: string | null;
}

export interface VehicleOption {
    id: number;
    name: string;
    plate: string;
}

/** A place the customer took a delivery before (customer_addresses). */
export interface SavedAddress {
    id: number;
    label: string | null;
    address: string;
    recipient_name: string | null;
    recipient_phone: string | null;
    times_used: number;
    last_used_at: string | null;
}

/**
 * A courier to an address, a vehicle that collects at the store, the customer
 * taking it in the store (handed over at Pick & pack), or decided later.
 */
export type DeliveryMethod = "courier" | "vehicle" | "later" | "store";

export type DeliveryPlan = {
    method: DeliveryMethod;
    address: string;
    addressId: number | null;
    recipient: string;
    phone: string;
    courierId: number | null;
    vehicleId: number | null;
    plate: string;
    /** The collecting vehicle's driver. */
    driverPhone: string;
};

/** What the server takes (PlaceOrderRequest / UpdateOrderAddressRequest). */
export const planToPayload = (plan: DeliveryPlan) => {
    const courier = plan.method === "courier";
    const vehicle = plan.method === "vehicle";
    // Nothing leaves the store by road: no address, courier or vehicle.
    const noRun = plan.method === "later" || plan.method === "store";

    return {
        delivery_method: plan.method,
        delivery_address: courier ? plan.address.trim() || null : null,
        customer_address_id: courier ? plan.addressId : null,
        recipient_name: plan.method === "later" ? null : plan.recipient.trim() || null,
        recipient_phone: plan.method === "later" ? null : plan.phone.trim() || null,
        courier_id: courier ? plan.courierId : null,
        vehicle_id: noRun ? null : plan.vehicleId,
        vehicle_plate: noRun ? null : plan.plate.trim() || null,
        driver_phone: vehicle ? plan.driverPhone.trim() || null : null,
    };
};

/** Whether the plan has what its method needs before the order is placed. */
export const planIsComplete = (plan: DeliveryPlan): boolean => {
    if (plan.method === "courier") return plan.address.trim() !== "";
    if (plan.method === "vehicle") return plan.plate.trim() !== "" && plan.driverPhone.trim() !== "";

    return true;
};
