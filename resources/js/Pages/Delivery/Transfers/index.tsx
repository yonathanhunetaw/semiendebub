import React from "react";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import { DeliveryHero } from "@/Components/Delivery/deliveryUi";
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
    pending: { label: "To collect", chip: "bg-warning-container text-on-warning-container border-warning/30" },
    in_transit: { label: "You hold it", chip: "bg-primary-container text-on-primary-container border-primary/30" },
    completed: { label: "Handed over", chip: "bg-success-container text-on-success-container border-success/30" },
    cancelled: { label: "Cancelled", chip: "bg-surface-container text-on-surface-variant border-outline-variant" },
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

            <DeliveryHero eyebrow="Site to site" title="Transfers" subtitle="Collect at one site, hand over at the next.">
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/15 p-1">
                    {([
                        { id: "all" as Tab, label: "All" },
                        { id: "available" as Tab, label: `Pool (${counts.available})` },
                        { id: "mine" as Tab, label: `Mine (${counts.mine})` },
                    ]).map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`rounded-xl py-2 text-[12px] font-bold transition-colors ${
                                tab === t.id ? "bg-white text-primary shadow-sm" : "text-white/85 hover:text-white"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </DeliveryHero>

            <div className="mx-auto max-w-xl space-y-3 px-3.5 pb-6 pt-4">
                {transfers.map((t) => {
                    const mine = t.courier_id === auth.user.id;
                    const status = STATUS[t.status];

                    return (
                        <div key={t.id} className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-3.5 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-mono text-[11px] font-bold text-primary">{t.reference}</p>
                                    <p className="truncate text-[14px] font-bold text-on-surface">{t.product_name}</p>
                                    <p className="font-mono text-[11px] text-on-surface-variant">
                                        {t.sku ?? "—"} · {t.quantity.toLocaleString()} units
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${status.chip}`}>
                                    {status.label}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center gap-1.5 rounded-[12px] bg-surface-container-low p-2 text-[11px]">
                                <span className="truncate rounded-[8px] bg-surface-container-lowest px-2 py-1 font-semibold text-on-surface ring-1 ring-outline-variant">
                                    {t.source_label ?? "Origin"}
                                </span>
                                <span className="material-symbols-outlined text-[16px] text-outline">arrow_forward</span>
                                <span className="material-symbols-outlined text-[16px] text-primary">local_shipping</span>
                                <span className="material-symbols-outlined text-[16px] text-outline">arrow_forward</span>
                                <span className="truncate rounded-[8px] bg-surface-container-lowest px-2 py-1 font-semibold text-on-surface ring-1 ring-outline-variant">
                                    {t.destination_label ?? "Destination"}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between gap-2">
                                <p className="text-[11px] text-on-surface-variant">
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
                                        className="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-on-primary active:scale-95"
                                    >
                                        Claim
                                    </button>
                                ) : null}
                                {mine && t.status === "in_transit" ? (
                                    <button
                                        type="button"
                                        onClick={() => act("delivery.transfers.handover", t)}
                                        className="rounded-[10px] bg-inverse-surface px-3 py-1.5 text-[12px] font-bold text-inverse-on-surface active:scale-95"
                                    >
                                        Hand over
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}

                {transfers.length === 0 ? (
                    <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest py-8 text-center">
                        <span className="material-symbols-outlined mb-2 text-[36px] text-outline/60">inbox</span>
                        <p className="text-[13px] font-bold text-on-surface">No transfers here</p>
                        <p className="mt-1 text-[11px] text-outline">
                            {tab === "mine" ? "Claim one from the pool." : "Nothing between sites needs carrying right now."}
                        </p>
                    </div>
                ) : null}
            </div>
        </>
    );
}

DeliveryTransfersIndex.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
