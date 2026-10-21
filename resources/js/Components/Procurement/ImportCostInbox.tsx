import React from "react";
import { Head, router } from "@inertiajs/react";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkHeader, inputClass, when } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import type { PendingImportCost } from "@/types/procurement";

export interface ImportCostInboxProps {
    waiting?: PendingImportCost[];
    recent?: PendingImportCost[];
    /** "{app}.import_costs" */
    routePrefix: string;
}

/**
 * Import costs (freight, customs, port fees) procurement recorded, waiting for
 * a second person: the same inbox on the finance and admin apps. Only
 * confirmed costs count in what the goods cost (ConsignmentService).
 */
export default function ImportCostInbox({ waiting = [], recent = [], routePrefix }: ImportCostInboxProps) {
    return (
        <>
            <Head title="Import costs" />
            <SkHeader title="Import costs to confirm" subtitle="What procurement paid on the way in. Check each against its receipt; whoever recorded a cost never confirms it." />

            {waiting.length === 0 ? (
                <EmptyState framed icon="task_alt" title="Nothing waiting" description="Costs procurement records on a consignment show up here." />
            ) : (
                <div className="space-y-3">
                    {waiting.map((c) => (
                        <CostRow key={c.id} cost={c} routePrefix={routePrefix} />
                    ))}
                </div>
            )}

            {recent.length > 0 ? (
                <SkCard className="mt-6">
                    <SkCardHeader icon="history" title="Recently settled" />
                    <ul>
                        {recent.map((c) => (
                            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-4 py-2.5 text-[13px] last:border-0">
                                <span className="min-w-0 truncate">
                                    <span className="font-mono">{c.consignment.reference}</span> · {c.label}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                    {money(c.amount_etb)}
                                    <StatusPill label={c.state === "confirmed" ? "Confirmed" : "Rejected"} tone={c.state === "confirmed" ? "success" : "error"} size="xs" />
                                </span>
                            </li>
                        ))}
                    </ul>
                </SkCard>
            ) : null}
        </>
    );
}

export function CostRow({ cost, routePrefix }: { cost: PendingImportCost; routePrefix: string }) {
    const [rejecting, setRejecting] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const post = (name: "confirm" | "reject", payload: Record<string, string> = {}) => {
        setBusy(true);
        router.post(route(`${routePrefix}.${name}`, cost.id), payload, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    return (
        <SkCard>
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 text-[14px]">
                    <p className="font-bold">
                        {cost.label}
                        {cost.description ? <span className="font-normal text-on-surface-variant"> · {cost.description}</span> : null}
                    </p>
                    <p className="text-[12px] text-on-surface-variant">
                        <span className="font-mono">{cost.consignment.reference}</span> · {cost.stage_label}
                        {cost.reference ? ` · receipt ${cost.reference}` : ""}
                        {cost.paid_on ? ` · paid ${when(cost.paid_on)}` : ""}
                        {cost.recorded_by ? ` · recorded by ${cost.recorded_by}` : ""}
                    </p>
                    {cost.recoverable ? <p className="mt-1 text-[12px] text-on-surface-variant">Claimed back: paid, but not part of the goods' cost.</p> : null}
                </div>
                <div className="text-right">
                    <p className="text-[16px] font-extrabold">
                        {cost.currency} {cost.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    {cost.currency !== "ETB" ? <p className="text-[12px] text-on-surface-variant">{money(cost.amount_etb)}</p> : null}
                </div>
            </div>
            {cost.can_confirm ? (
                <div className="border-t border-outline-variant/60 px-4 py-3">
                    {rejecting ? (
                        <div className="flex gap-2">
                            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it wrong?" autoFocus />
                            <SkButton variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => post("reject", { reason })}>
                                Reject
                            </SkButton>
                            <SkButton variant="ghost" onClick={() => setRejecting(false)}>
                                Cancel
                            </SkButton>
                        </div>
                    ) : (
                        <div className="flex justify-end gap-2">
                            <SkButton variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
                                Reject
                            </SkButton>
                            <SkButton variant="success" icon="check" disabled={busy} onClick={() => post("confirm")}>
                                Confirm
                            </SkButton>
                        </div>
                    )}
                </div>
            ) : null}
        </SkCard>
    );
}
