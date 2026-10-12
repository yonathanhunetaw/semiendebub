import type { CourierOption, DeliveryMethod, DeliveryPlan, SavedAddress, VehicleOption } from "@/types/delivery-plan";
import React from "react";

/**
 * Where an order goes and how. Four ways:
 *
 *   store     the customer takes it in the store: Pick & pack hands it over
 *             at the counter, with no courier. Off when a line needs a hub.
 *   courier   a courier takes it to an address: a saved address of the
 *             customer's (or a new one, saved on the customer when the order
 *             is placed), the recipient, the courier and optionally a vehicle.
 *   vehicle   a vehicle (the customer's or a hired one) collects it at the
 *             store: its plate and the driver's phone.
 *   later     nothing is known yet; it is added on To pay or Pick & pack.
 *
 * The courier is named now but only sees the run once the order is paid and
 * picked. Used by the order confirmation and To pay.
 */

const METHODS: Array<{ id: DeliveryMethod; label: string; icon: string; hint: string }> = [
    { id: "store", label: "In store", icon: "storefront", hint: "Customer takes it now" },
    { id: "courier", label: "Standard delivery", icon: "home_pin", hint: "Courier to an address" },
    { id: "vehicle", label: "Vehicle dispatch", icon: "local_shipping", hint: "A vehicle collects it" },
    { id: "later", label: "Add later", icon: "schedule", hint: "Decide before it ships" },
];
export default function DeliveryPlanner({
    plan,
    onChange,
    couriers = [],
    vehicles = [],
    addresses = [],
    inStoreBlocked = null,
}: {
    plan: DeliveryPlan;
    onChange: (next: DeliveryPlan) => void;
    couriers?: CourierOption[];
    vehicles?: VehicleOption[];
    addresses?: SavedAddress[];
    /** Why the customer cannot take it in the store (a line needs a hub). */
    inStoreBlocked?: string | null;
}): React.ReactElement {
    const set = (patch: Partial<DeliveryPlan>) => onChange({ ...plan, ...patch });
    const fleetVehicle = vehicles.find((vehicle) => vehicle.id === plan.vehicleId) ?? null;

    const pickSaved = (saved: SavedAddress) =>
        set({
            addressId: saved.id,
            address: saved.address,
            recipient: saved.recipient_name ?? plan.recipient,
            phone: saved.recipient_phone ?? plan.phone,
        });

    const inputClass =
        "w-full rounded-[10px] border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-outline";
    const labelClass = "mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant";

    const methodPicker = (
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Delivery method">
            {METHODS.map((method) => {
                const active = plan.method === method.id;
                const blocked = method.id === "store" && inStoreBlocked !== null;

                return (
                    <button
                        key={method.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={blocked}
                        title={blocked ? inStoreBlocked : undefined}
                        onClick={() => set({ method: method.id })}
                        className={`flex flex-col items-center gap-0.5 rounded-[10px] border px-1.5 py-2 text-center transition-colors disabled:opacity-40 ${
                            active ? "border-primary bg-primary-container/30 text-primary" : "border-outline-variant text-on-surface-variant"
                        }`}
                    >
                        <span className="material-symbols-outlined text-[20px]">{method.icon}</span>
                        <span className="text-[11px] font-bold leading-tight text-on-surface">{method.label}</span>
                        <span className="hidden text-[10px] leading-tight sm:block">{method.hint}</span>
                    </button>
                );
            })}
        </div>
    );

    if (plan.method === "store") {
        return (
            <div className="space-y-3">
                {methodPicker}
                <p className="flex items-start gap-1.5 rounded-[10px] border border-info/30 bg-info-container/50 px-2.5 py-2 text-[11px] text-on-info-container">
                    <span className="material-symbols-outlined text-[14px]">storefront</span>
                    The customer takes it here. Once every payment is confirmed, a seller or stock keeper picks it from
                    the shelf or floor and hands it over in Pick &amp; pack.
                </p>
            </div>
        );
    }

    if (plan.method === "later") {
        return (
            <div className="space-y-3">
                {methodPicker}
                <p className="flex items-start gap-1.5 rounded-[10px] border border-warning/30 bg-warning-container/50 px-2.5 py-2 text-[11px] text-on-warning-container">
                    <span className="material-symbols-outlined text-[14px]">edit_location_alt</span>
                    No delivery details yet. Add the address or the collecting vehicle from the order before it is
                    handed over.
                </p>
            </div>
        );
    }

    if (plan.method === "vehicle") {
        return (
            <div className="space-y-4">
                {methodPicker}
                <div>
                    <p className={labelClass}>
                        <span className="material-symbols-outlined text-[15px]">local_shipping</span>
                        Collecting vehicle
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                            value={plan.vehicleId ?? ""}
                            onChange={(event) => {
                                const id = event.target.value ? Number(event.target.value) : null;
                                const vehicle = vehicles.find((entry) => entry.id === id);
                                set({ vehicleId: id, plate: vehicle?.plate ?? "" });
                            }}
                            className={inputClass}
                        >
                            <option value="">Not from the fleet</option>
                            {vehicles.map((vehicle) => (
                                <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.name}
                                </option>
                            ))}
                        </select>
                        <input
                            value={plan.plate}
                            onChange={(event) => set({ plate: event.target.value.toUpperCase() })}
                            placeholder="Plate no., e.g. 3-A12345"
                            readOnly={fleetVehicle !== null}
                            aria-label="Plate number"
                            className={`${inputClass} font-mono ${fleetVehicle ? "opacity-70" : ""}`}
                        />
                        <input
                            value={plan.driverPhone}
                            onChange={(event) => set({ driverPhone: event.target.value })}
                            placeholder="Driver phone"
                            inputMode="tel"
                            aria-label="Driver phone"
                            className={inputClass}
                        />
                        <input
                            value={plan.recipient}
                            onChange={(event) => set({ recipient: event.target.value })}
                            placeholder="Driver / receiver name"
                            aria-label="Receiver name"
                            className={inputClass}
                        />
                    </div>
                    <p className="mt-1 text-[11px] text-outline">
                        The vehicle picks the order up at the store and carries it to its destination.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {methodPicker}

            {/* ── Location ── */}
            <div>
                <p className={labelClass}>
                    <span className="material-symbols-outlined text-[15px]">location_on</span>
                    Location
                </p>

                {addresses.length > 0 ? (
                    <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                        {addresses.map((saved) => {
                            const active = plan.addressId === saved.id;

                            return (
                                <button
                                    key={saved.id}
                                    type="button"
                                    onClick={() => pickSaved(saved)}
                                    className={`w-[180px] shrink-0 rounded-[10px] border p-2 text-left transition-colors ${
                                        active ? "border-primary bg-primary-container/25" : "border-outline-variant"
                                    }`}
                                >
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-primary">
                                        <span className="material-symbols-outlined text-[13px]">bookmark</span>
                                        {saved.label ?? "Saved"} · used {saved.times_used}×
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 block text-[11px] text-on-surface">{saved.address}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                <div className="space-y-2">
                    <textarea
                        value={plan.address}
                        onChange={(event) => set({ address: event.target.value, addressId: null })}
                        placeholder="Delivery address (sub-city, woreda, house no.)"
                        rows={2}
                        className={inputClass}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                            value={plan.recipient}
                            onChange={(event) => set({ recipient: event.target.value })}
                            placeholder="Recipient name"
                            className={inputClass}
                        />
                        <input
                            value={plan.phone}
                            onChange={(event) => set({ phone: event.target.value })}
                            placeholder="Recipient phone"
                            inputMode="tel"
                            className={inputClass}
                        />
                    </div>
                    <p className="text-[11px] text-outline">A new address is saved on the customer for next time.</p>
                </div>
            </div>

            {/* ── Courier ── */}
            <div>
                <p className={labelClass}>
                    <span className="material-symbols-outlined text-[15px]">person_pin_circle</span>
                    Courier
                </p>
                <select
                    value={plan.courierId ?? ""}
                    onChange={(event) => set({ courierId: event.target.value ? Number(event.target.value) : null })}
                    className={inputClass}
                >
                    <option value="">Any courier claims it after Pick &amp; pack</option>
                    {couriers.map((courier) => (
                        <option key={courier.id} value={courier.id}>
                            {courier.name}
                            {courier.phone ? ` · ${courier.phone}` : ""}
                        </option>
                    ))}
                </select>
            </div>

            {/* ── Vehicle ── */}
            <div>
                <p className={labelClass}>
                    <span className="material-symbols-outlined text-[15px]">local_shipping</span>
                    Vehicle &amp; plate
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                        value={plan.vehicleId ?? ""}
                        onChange={(event) => {
                            const id = event.target.value ? Number(event.target.value) : null;
                            const vehicle = vehicles.find((entry) => entry.id === id);
                            set({ vehicleId: id, plate: vehicle?.plate ?? "" });
                        }}
                        className={inputClass}
                    >
                        <option value="">Not from the fleet</option>
                        {vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.name}
                            </option>
                        ))}
                    </select>
                    <input
                        value={plan.plate}
                        onChange={(event) => set({ plate: event.target.value.toUpperCase() })}
                        placeholder="Plate no., e.g. 3-A12345"
                        readOnly={fleetVehicle !== null}
                        className={`${inputClass} font-mono ${fleetVehicle ? "opacity-70" : ""}`}
                    />
                </div>
                <p className="mt-1 text-[11px] text-outline">
                    {fleetVehicle ? `Fleet vehicle ${fleetVehicle.name}, plate ${fleetVehicle.plate}.` : "Pick a fleet vehicle or type any plate."}
                </p>
            </div>

            <p className="flex items-start gap-1.5 rounded-[10px] border border-info/30 bg-info-container/50 px-2.5 py-2 text-[11px] text-on-info-container">
                <span className="material-symbols-outlined text-[14px]">lock_clock</span>
                The courier sees this run only after the payment is confirmed by two people and the order is picked
                and packed.
            </p>
        </div>
    );
}
