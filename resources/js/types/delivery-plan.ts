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

/** A courier to an address, a vehicle that collects at the store, or decided later. */
export type DeliveryMethod = "courier" | "vehicle" | "later";

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

    return {
        delivery_method: plan.method,
        delivery_address: courier ? plan.address.trim() || null : null,
        customer_address_id: courier ? plan.addressId : null,
        recipient_name: plan.method === "later" ? null : plan.recipient.trim() || null,
        recipient_phone: plan.method === "later" ? null : plan.phone.trim() || null,
        courier_id: courier ? plan.courierId : null,
        vehicle_id: plan.method === "later" ? null : plan.vehicleId,
        vehicle_plate: plan.method === "later" ? null : plan.plate.trim() || null,
        driver_phone: vehicle ? plan.driverPhone.trim() || null : null,
    };
};

/** Whether the plan has what its method needs before the order is placed. */
export const planIsComplete = (plan: DeliveryPlan): boolean => {
    if (plan.method === "courier") return plan.address.trim() !== "";
    if (plan.method === "vehicle") return plan.plate.trim() !== "" && plan.driverPhone.trim() !== "";

    return true;
};
