import type { RideView, WorkApp } from "@/types/work";
import { router, useForm } from "@inertiajs/react";
import React, { useState } from "react";
import { cardCls, Chip, ghostBtn, hm, inputCls, primaryBtn, wr } from "./workUi";

interface Props {
    app: WorkApp;
    ride: RideView;
    /** Cars the driver can pick (delivery app). */
    vehicles?: { id: number; name: string; plate: string; key_holder_id: number | null }[];
    meId?: number;
}

/**
 * One staff ride: when, from where, who rides and where they get off; and
 * what the viewer can do (claim, set off, drop each rider, finish, opt out, cancel).
 */
export default function RideCard({ app, ride, vehicles = [], meId }: Props): React.ReactElement {
    const [car, setCar] = useState<string>("");
    const post = (name: string, data: Record<string, string | number | boolean | null> = {}) => router.post(wr(app, name, ride.id), data, { preserveScroll: true });
    const riding = ride.riders.filter((r) => r.status === "riding").length;
    const picked = vehicles.find((v) => String(v.id) === car);
    const fuel = useForm<{ amount: string; litres: string; receipt: File | null }>({ amount: "", litres: "", receipt: null });

    return (
        <section className={cardCls}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[14px] font-bold text-on-surface">
                        {ride.departs_at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? "Today" : ride.departs_at.slice(0, 10)} {hm(ride.departs_at)} · from {ride.site?.name}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                        {ride.driver ? `${ride.driver.name} · ${ride.vehicle?.name} ${ride.vehicle?.plate}` : "No driver yet"}
                        {ride.driver && !ride.driver_holds_key ? " · car key not with the driver" : ""}
                        {ride.note ? ` · ${ride.note}` : ""}
                    </p>
                </div>
                <Chip status={ride.status} />
            </div>

            <ul className="mt-2 divide-y divide-outline-variant/40">
                {ride.riders.map((rider) => (
                    <li key={rider.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span className={`text-[12px] ${rider.status === "riding" ? "text-on-surface" : "text-on-surface-variant line-through"}`}>
                            {rider.name}
                            <span className="text-on-surface-variant"> · {rider.drop_off ?? "drop-off not set"}</span>
                        </span>
                        {ride.can.drive && rider.status === "riding" ? (
                            <span className="flex gap-2">
                                {ride.status === "departed" ? (
                                    <button type="button" className="text-[11px] font-bold text-primary" onClick={() => post("work.rides.drop", { user_id: rider.id, showed_up: true })}>
                                        Dropped
                                    </button>
                                ) : null}
                                <button type="button" className="text-[11px] font-bold text-on-surface-variant" onClick={() => post("work.rides.drop", { user_id: rider.id, showed_up: false })}>
                                    Not there
                                </button>
                            </span>
                        ) : rider.status !== "riding" ? (
                            <span className="text-[10px] text-on-surface-variant">{rider.status.replace("_", " ")}</span>
                        ) : null}
                    </li>
                ))}
            </ul>

            {ride.fuel ? (
                <p className="mt-2 text-[11px] text-on-surface-variant">
                    Fuel: ETB {ride.fuel.amount.toLocaleString()}
                    {ride.fuel.litres ? ` · ${ride.fuel.litres} L` : ""} ·{" "}
                    {ride.fuel.status === "confirmed" ? "confirmed by finance" : ride.fuel.status === "rejected" ? `rejected: ${ride.fuel.reject_reason ?? ""}` : "waiting for finance"}
                </p>
            ) : null}

            {ride.can.fuel ? (
                <form
                    className="mt-3 grid grid-cols-2 gap-2 rounded-[12px] border border-outline-variant/60 p-2.5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        fuel.post(wr(app, "work.rides.fuel", ride.id), { preserveScroll: true, forceFormData: true, onSuccess: () => fuel.reset() });
                    }}
                >
                    <p className="col-span-2 text-[12px] font-bold text-on-surface">Fuel for this ride</p>
                    <input className={inputCls} inputMode="decimal" placeholder="Amount (ETB)" value={fuel.data.amount} onChange={(e) => fuel.setData("amount", e.target.value)} required />
                    <input className={inputCls} inputMode="decimal" placeholder="Litres (optional)" value={fuel.data.litres} onChange={(e) => fuel.setData("litres", e.target.value)} />
                    <label className="col-span-2 text-[11px] text-on-surface-variant">
                        Receipt photo (optional)
                        <input type="file" accept="image/*,application/pdf" capture="environment" className="mt-1 block text-[12px]" onChange={(e) => fuel.setData("receipt", e.target.files?.[0] ?? null)} />
                    </label>
                    {Object.values(fuel.errors).map((m) => (
                        <p key={m} className="col-span-2 text-[11px] text-error">
                            {m}
                        </p>
                    ))}
                    <button type="submit" className={`col-span-2 ${primaryBtn}`} disabled={fuel.processing || fuel.data.amount === ""}>
                        Record fuel
                    </button>
                </form>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
                {ride.can.claim ? (
                    <>
                        <select className={`${inputCls} flex-1`} value={car} onChange={(e) => setCar(e.target.value)}>
                            <option value="">Which car…</option>
                            {vehicles.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name} · {v.plate}
                                    {meId !== undefined && v.key_holder_id === meId ? " (you hold the key)" : ""}
                                </option>
                            ))}
                        </select>
                        <button type="button" className={primaryBtn} disabled={!picked} onClick={() => post("work.rides.claim", { vehicle_id: Number(car) })}>
                            Take ride
                        </button>
                    </>
                ) : null}
                {ride.can.drive && ride.status === "claimed" ? (
                    <>
                        <button type="button" className={primaryBtn} onClick={() => post("work.rides.depart")}>
                            Set off
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => post("work.rides.release")}>
                            Give back
                        </button>
                    </>
                ) : null}
                {ride.can.drive && ride.status === "departed" ? (
                    <button type="button" className={primaryBtn} disabled={riding > 0} onClick={() => post("work.rides.finish")}>
                        Finish
                    </button>
                ) : null}
                {ride.can.opt_out ? (
                    <button type="button" className={ghostBtn} onClick={() => post("work.rides.opt-out")}>
                        I don’t need it
                    </button>
                ) : null}
                {ride.can.cancel ? (
                    <button type="button" className="text-[12px] font-bold text-error" onClick={() => post("work.rides.cancel")}>
                        Cancel ride
                    </button>
                ) : null}
            </div>
        </section>
    );
}
