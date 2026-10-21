import React from "react";
import { Head, router } from "@inertiajs/react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";

interface ArrivalLine {
    id: number;
    variant: { name: string; detail: string | null; unit: string; sku: string } | null;
    quantity: number;
}

interface Arrival {
    id: number;
    reference: string;
    stage: string;
    stage_label: string;
    container_number: string | null;
    eta: string | null;
    lines: ArrivalLine[];
}

interface Props {
    consignments?: Arrival[];
    hubs?: Array<{ id: number; name: string }>;
}

type Count = { received: string; damaged: string; note: string };

/**
 * Goods we bought, on their way in: count each consignment in at a Main Hub.
 * Whole units go into the hub; anything short or over waits under Receiving
 * for someone else to settle; damaged units are written off.
 */
export default function Arrivals({ consignments = [], hubs = [] }: Props) {
    const [open, setOpen] = React.useState<Arrival | null>(null);

    return (
        <>
            <Head title="Arrivals" />
            <SkHeader title="Arrivals" subtitle="Goods procurement bought, on their way to a Main Hub. When one arrives, count it in here." />

            {consignments.length === 0 ? (
                <EmptyState framed icon="sailing" title="Nothing on its way" description="Consignments procurement sends show up here until they are received." />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {consignments.map((c) => (
                        <SkCard key={c.id}>
                            <SkCardHeader icon="sailing" title={<span className="font-mono">{c.reference}</span>} right={<StatusPill label={c.stage_label} tone="info" size="xs" />} />
                            <div className="space-y-1 p-4 text-[13px]">
                                <p className="text-on-surface-variant">{[c.container_number, c.eta ? `expected ${when(c.eta)}` : null].filter(Boolean).join(" · ") || "No ETA"}</p>
                                {c.lines.map((l) => (
                                    <p key={l.id}>
                                        {l.quantity} {l.variant?.unit} · <span className="font-semibold">{l.variant?.name}</span>
                                        {l.variant?.detail ? <span className="text-on-surface-variant"> · {l.variant.detail}</span> : null}
                                    </p>
                                ))}
                            </div>
                            <div className="flex justify-end border-t border-outline-variant/60 px-4 py-3">
                                <SkButton icon="move_to_inbox" disabled={hubs.length === 0} onClick={() => setOpen(c)}>
                                    It has arrived
                                </SkButton>
                            </div>
                        </SkCard>
                    ))}
                </div>
            )}

            {hubs.length === 0 && consignments.length > 0 ? <p className="mt-3 text-[13px] text-on-surface-variant">You are not one of a Main Hub's people, so you cannot count these in.</p> : null}

            <ReceiveSheet arrival={open} hubs={hubs} onClose={() => setOpen(null)} />
        </>
    );
}

function ReceiveSheet({ arrival, hubs, onClose }: { arrival: Arrival | null; hubs: Array<{ id: number; name: string }>; onClose: () => void }) {
    const [hubId, setHubId] = React.useState("");
    const [counts, setCounts] = React.useState<Record<number, Count>>({});
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!arrival) return;
        setHubId(hubs[0] ? String(hubs[0].id) : "");
        setCounts(Object.fromEntries(arrival.lines.map((l) => [l.id, { received: String(l.quantity), damaged: "", note: "" }])));
        setErrors({});
    }, [arrival, hubs]);

    if (!arrival) return null;

    const set = (id: number, patch: Partial<Count>) => setCounts((c) => ({ ...c, [id]: { ...c[id], ...patch } }));

    const submit = () => {
        setBusy(true);
        router.post(
            route("stock_keeper.arrivals.receive", arrival.id),
            {
                hub_id: hubId,
                counts: Object.fromEntries(Object.entries(counts).map(([id, c]) => [id, { received: c.received, damaged: c.damaged || null, note: c.note || null }])),
            },
            { preserveScroll: true, onSuccess: onClose, onError: setErrors, onFinish: () => setBusy(false) },
        );
    };

    return (
        <SkSheet
            open
            onClose={onClose}
            wide
            title={`Count in ${arrival.reference}`}
            subtitle="How many arrived, and how many of those are broken. Leave a line as it is if it all arrived whole."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton icon="move_to_inbox" disabled={busy || hubId === ""} onClick={submit}>
                        Receive
                    </SkButton>
                </div>
            }
        >
            <div className="space-y-4">
                {hubs.length > 1 ? (
                    <SkField label="Into" error={errors.hub_id}>
                        <select className={inputClass} value={hubId} onChange={(e) => setHubId(e.target.value)}>
                            {hubs.map((h) => (
                                <option key={h.id} value={h.id}>
                                    {h.name}
                                </option>
                            ))}
                        </select>
                    </SkField>
                ) : (
                    <p className="text-[14px]">Into {hubs[0]?.name}.</p>
                )}
                {arrival.lines.map((l) => {
                    const c = counts[l.id] ?? { received: "", damaged: "", note: "" };
                    const diff = Number(c.received) - l.quantity;
                    return (
                        <div key={l.id} className="rounded-[14px] border border-outline-variant p-3">
                            <p className="text-[14px] font-semibold">
                                {l.variant?.name}
                                {l.variant?.detail ? <span className="font-normal text-on-surface-variant"> · {l.variant.detail}</span> : null}
                            </p>
                            <p className="mb-2 text-[12px] text-on-surface-variant">
                                Sent {l.quantity} {l.variant?.unit}
                                {c.received !== "" && diff !== 0 ? <span className={diff < 0 ? "text-error" : "text-warning"}> · {diff < 0 ? `${-diff} short` : `${diff} over`}</span> : null}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                <SkField label="Arrived" error={errors[`counts.${l.id}.received`]}>
                                    <input className={inputClass} type="number" min={0} value={c.received} onChange={(e) => set(l.id, { received: e.target.value })} />
                                </SkField>
                                <SkField label="Broken" error={errors[`counts.${l.id}.damaged`]}>
                                    <input className={inputClass} type="number" min={0} value={c.damaged} onChange={(e) => set(l.id, { damaged: e.target.value })} placeholder="0" />
                                </SkField>
                                <SkField label="Note">
                                    <input className={inputClass} value={c.note} onChange={(e) => set(l.id, { note: e.target.value })} />
                                </SkField>
                            </div>
                        </div>
                    );
                })}
            </div>
        </SkSheet>
    );
}

Arrivals.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
