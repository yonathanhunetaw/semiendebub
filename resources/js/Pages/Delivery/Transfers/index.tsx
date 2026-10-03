import React from "react";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import { Head, router, usePage } from "@inertiajs/react";

type Tab = "all" | "available" | "mine";

/** TransferWorkflowService::present() */
interface CourierTransfer {
    id: number;
    reference: string;
    product_name: string;
    sku: string | null;
    quantity: number;
    status: "pending" | "in_transit" | "completed" | "cancelled";
    source_label: string | null;
    destination_label: string | null;
    courier: string | null;
    courier_id: number | null;
    dispatched_at: string | null;
    created_at: string | null;
}

interface Props {
    transfers?: CourierTransfer[];
    tab?: Tab;
    counts?: { mine: number; available: number };
}

const STATUS: Record<CourierTransfer["status"], { label: string; chip: string }> = {
    pending: { label: "To collect", chip: "bg-amber-50 text-amber-800 border-amber-200" },
    in_transit: { label: "You hold it", chip: "bg-orange-50 text-[#c2410c] border-orange-200" },
    completed: { label: "Handed over", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    cancelled: { label: "Cancelled", chip: "bg-slate-100 text-slate-500 border-slate-200" },
};

/**
 * Transfers between two sites, as a courier carries them.
 *
 * The pool holds transfers nobody is carrying yet; claiming one makes it the
 * courier's. The origin's staff then dispatch it — that is the hand-off, and
 * the goods sit in Delivery's custody — and the courier hands them over at the
 * destination here.
 */
export default function DeliveryTransfersIndex({ transfers = [], tab = "all", counts = { mine: 0, available: 0 } }: Props) {
    const { auth } = usePage<{ auth: { user: { id: number } } }>().props;

    const setTab = (next: Tab) =>
        router.get(route("delivery.transfers.index"), next === "all" ? {} : { tab: next }, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });

    const act = (name: string, transfer: CourierTransfer) =>
        router.post(route(name, transfer.id), {}, { preserveScroll: true });

    return (
        <>
            <Head title="Transfers" />

            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[20px] text-[#c2410c]">swap_horiz</span>
                    <h1 className="text-[16px] font-bold tracking-tight text-gray-900">Transfers</h1>
                </div>
                <div className="flex items-center gap-0.5 rounded-[999px] border border-slate-200/80 bg-slate-50 p-0.5">
                    {([
                        { id: "all" as Tab, label: "ALL" },
                        { id: "available" as Tab, label: `POOL (${counts.available})` },
                        { id: "mine" as Tab, label: `MINE (${counts.mine})` },
                    ]).map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`rounded-[999px] px-2 py-1 text-[10px] font-bold tracking-wide transition-colors ${
                                tab === t.id ? "bg-[#c2410c] text-white" : "text-slate-500 hover:text-[#c2410c]"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3 px-3.5 pb-36 pt-3">
                {transfers.map((t) => {
                    const mine = t.courier_id === auth.user.id;
                    const status = STATUS[t.status];

                    return (
                        <div key={t.id} className="rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-mono text-[11px] font-bold text-[#c2410c]">{t.reference}</p>
                                    <p className="truncate text-[14px] font-bold text-gray-900">{t.product_name}</p>
                                    <p className="font-mono text-[11px] text-slate-500">
                                        {t.sku ?? "—"} · {t.quantity.toLocaleString()} units
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${status.chip}`}>
                                    {status.label}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center gap-1.5 rounded-[12px] bg-slate-50 p-2 text-[11px]">
                                <span className="truncate rounded-[8px] bg-white px-2 py-1 font-semibold text-gray-800 ring-1 ring-slate-200">
                                    {t.source_label ?? "Origin"}
                                </span>
                                <span className="material-symbols-outlined text-[16px] text-slate-400">arrow_forward</span>
                                <span className="material-symbols-outlined text-[16px] text-[#c2410c]">local_shipping</span>
                                <span className="material-symbols-outlined text-[16px] text-slate-400">arrow_forward</span>
                                <span className="truncate rounded-[8px] bg-white px-2 py-1 font-semibold text-gray-800 ring-1 ring-slate-200">
                                    {t.destination_label ?? "Destination"}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-500">
                                    {t.courier_id === null
                                        ? "No courier yet"
                                        : mine
                                          ? t.status === "pending"
                                              ? "Yours — the origin hands it to you when they dispatch"
                                              : "Yours — hand it to the destination"
                                          : `Carried by ${t.courier}`}
                                </p>
                                {t.courier_id === null && t.status === "pending" ? (
                                    <button
                                        type="button"
                                        onClick={() => act("delivery.transfers.claim", t)}
                                        className="rounded-[10px] bg-[#c2410c] px-3 py-1.5 text-[12px] font-bold text-white active:scale-95"
                                    >
                                        Claim
                                    </button>
                                ) : null}
                                {mine && t.status === "in_transit" ? (
                                    <button
                                        type="button"
                                        onClick={() => act("delivery.transfers.handover", t)}
                                        className="rounded-[10px] bg-[#0b1c30] px-3 py-1.5 text-[12px] font-bold text-white active:scale-95"
                                    >
                                        Hand over
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}

                {transfers.length === 0 ? (
                    <div className="rounded-[16px] border border-slate-100 bg-white py-8 text-center">
                        <span className="material-symbols-outlined mb-2 text-[36px] text-slate-300">inbox</span>
                        <p className="text-[13px] font-bold text-gray-900">No transfers here</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                            {tab === "mine" ? "Claim one from the pool." : "Nothing between sites needs carrying right now."}
                        </p>
                    </div>
                ) : null}
            </div>
        </>
    );
}

DeliveryTransfersIndex.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
