import { useForm } from "@inertiajs/react";
import React from "react";
import type { TransferRow } from "@/types/stockkeeper";

/**
 * Taking a transfer in: how many arrived and how many of those are damaged.
 * What arrived lands; damage is written off; a shortfall stays with the
 * courier as a discrepancy under Receiving.
 */
export default function TransferReceiveSheet({ transfer, onClose }: { transfer: TransferRow; onClose: () => void }) {
    const form = useForm({ received: String(transfer.quantity), damaged: "0" });
    const received = Number(form.data.received || 0);
    const damaged = Number(form.data.damaged || 0);
    const short = Math.max(0, transfer.quantity - received);
    const valid = form.data.received !== "" && received >= 0 && damaged >= 0 && damaged <= received;

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route("stock_keeper.transfers.complete", transfer.id), { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <div className="fixed inset-0 z-[1400] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-surface/40" />
            <form onSubmit={save} className="relative w-full rounded-t-[24px] bg-surface-container-lowest p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[440px] sm:rounded-[24px] sm:p-6">
                <h2 className="text-[18px] font-extrabold text-on-surface">Receive {transfer.reference}</h2>
                <p className="text-[13px] text-on-surface-variant">
                    {transfer.product_name} · {transfer.quantity} sent{transfer.destination_label ? ` to ${transfer.destination_label}` : ""}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    {(["received", "damaged"] as const).map((key) => (
                        <label key={key} className="block">
                            <span className="mb-1 block text-[13px] font-bold text-on-surface">{key === "received" ? "Arrived" : "Of those, damaged"}</span>
                            <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={form.data[key]}
                                onChange={(e) => form.setData(key, e.target.value)}
                                className="h-12 w-full rounded-[12px] border border-outline-variant bg-surface-container-low px-3 text-center text-[20px] font-extrabold tabular-nums focus:border-primary focus:ring-0"
                            />
                        </label>
                    ))}
                </div>
                {(short > 0 || damaged > 0 || received > transfer.quantity) && (
                    <p className="mt-3 rounded-[12px] bg-warning-container px-3 py-2 text-[13px] text-on-warning-container">
                        {short > 0 ? `${short} missing stays with the courier until found or written off. ` : ""}
                        {damaged > 0 ? `${damaged} damaged will be written off. ` : ""}
                        {received > transfer.quantity ? `${received - transfer.quantity} extra will be booked in for review.` : ""}
                    </p>
                )}
                {!valid && form.data.received !== "" && <p className="mt-2 text-[13px] text-error">Damaged can't be more than what arrived.</p>}
                <div className="mt-4 flex gap-2">
                    <button type="submit" disabled={!valid || form.processing} className="flex-1 rounded-[12px] bg-primary py-3 text-[15px] font-bold text-on-primary disabled:opacity-50">
                        Receive
                    </button>
                    <button type="button" onClick={onClose} className="rounded-[12px] px-4 text-[14px] font-bold text-on-surface-variant hover:bg-surface-container">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
