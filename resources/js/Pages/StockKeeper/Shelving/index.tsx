import { Head, Link, router } from "@inertiajs/react";
import { shopZone } from "@/utils/dates";
import React, { useState } from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkHeader, SkStats, fmt } from "@/Components/StockKeeper/skKit";
import type { RefillRow, ShelvingBoard, ShelvingNeed } from "@/types/refills";

interface Props {
    storeId?: number | null;
    board?: ShelvingBoard | null;
}

const NEED: Record<ShelvingNeed["status"], { label: string; tone: Tone }> = {
    empty: { label: "Empty", tone: "neutral" },
    refill: { label: "Refill", tone: "warning" },
    critical: { label: "Crit low", tone: "error" },
};

const scheduled = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleString(undefined, { timeZone: shopZone(), weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not scheduled yet";

/** What became of a request, in the stock keeper's words. */
function fate(row: RefillRow): { text: string; tone: Tone; icon: string } {
    const to = row.destination === "remote_hub" ? " to the Remote Hub" : "";

    switch (row.stage) {
        case "waiting":
            return { text: "Waiting for the manager", tone: "warning", icon: "hourglass_top" };
        case "remote_list":
            return { text: `On the Remote Hub list${row.added_by ? ` (added by ${row.added_by})` : ""} · waiting for the hub to send it`, tone: "info", icon: "playlist_add_check" };
        case "remote_on_way":
            return { text: `Coming from the Remote Hub${row.transfer ? ` · ${row.transfer.reference}` : ""}`, tone: "info", icon: "local_shipping" };
        case "on_manifest":
            return { text: `On manifest ${row.shipment?.reference ?? ""}${to} · ${scheduled(row.shipment?.scheduled_for ?? null)}`, tone: "success", icon: "event_available" };
        case "landed":
            return { text: "Arrived", tone: "neutral", icon: "task_alt" };
        case "cancelled":
            return { text: `Cancelled${row.cancelled_by ? ` by ${row.cancelled_by}` : ""}${row.cancel_reason ? `: ${row.cancel_reason}` : ""}`, tone: "error", icon: "cancel" };
    }
}

/**
 * The shelving list: floor → shelf transfers to carry across (no courier, no
 * approval), approved Remote Hub refills to send, shelf items at their refill
 * line with nothing on its way, and what became of each request.
 */
export default function Shelving({ storeId = null, board = null }: Props): React.ReactElement {
    const [busy, setBusy] = useState<string | null>(null);

    const post = (key: string, url: string, data: Record<string, string> = {}) => {
        setBusy(key);
        router.post(url, data, { preserveScroll: true, onFinish: () => setBusy(null) });
    };

    if (storeId === null || board === null || board.shelf === null) {
        return (
            <>
                <Head title="Shelving" />
                <SkHeader title="Shelving" subtitle="Floor → shelf refills for your store." />
                <EmptyState icon="shelves" title="No store shelf to work on" description="You need to be assigned to a store with a Store Shelf to see its shelving list." framed />
            </>
        );
    }

    const shelfId = board.shelf.id;

    return (
        <>
            <Head title="Shelving" />

            <SkHeader
                title="Shelving"
                subtitle={`${board.shelf.name} · carry stock across from the store floor.`}
                actions={
                    <Link href={route("stock_keeper.shelving.permissions")}>
                        <SkButton variant="outline" icon="group">Who can do what</SkButton>
                    </Link>
                }
            />

            <SkStats
                items={[
                    { label: "To shelve", value: fmt(board.to_shelve.length), icon: "shelves", tone: board.to_shelve.length > 0 ? "warning" : undefined },
                    { label: "To send from hub", value: fmt(board.to_accept.length), icon: "approval" },
                    { label: "Needs a refill", value: fmt(board.needs.length), icon: "trending_down", tone: board.needs.some((n) => n.status === "critical") ? "error" : undefined },
                    { label: "My requests", value: fmt(board.my_requests.length), icon: "history" },
                ]}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
                <div className="flex flex-col gap-4 lg:gap-6">
                    <SkCard>
                        <SkCardHeader icon="shelves" title={`To shelve (${board.to_shelve.length})`} />
                        {board.to_shelve.length === 0 ? (
                            <EmptyState icon="check_circle" title="Nothing to shelve" description="Refills from the store floor land here." />
                        ) : (
                            <ul className="divide-y divide-outline-variant/60">
                                {board.to_shelve.map((task) => (
                                    <li key={task.transfer_id} className="flex items-center gap-3 px-4 py-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-[15px] font-bold text-on-surface">{task.item_name}</p>
                                                {task.urgent && <StatusPill tone="error" label="Crit low" size="sm" />}
                                            </div>
                                            <p className="text-[18px] font-extrabold tabular-nums text-on-surface">{task.display}</p>
                                            <p className="truncate font-mono text-[11px] text-on-surface-variant">
                                                {task.reference}
                                                {task.refill_reference ? ` · ${task.refill_reference}` : ""}
                                            </p>
                                        </div>
                                        {board.can_shelve && (
                                            <SkButton icon="check" disabled={busy !== null} onClick={() => post(`shelve-${task.transfer_id}`, route("stock_keeper.shelving.shelve", task.transfer_id))}>
                                                Shelved
                                            </SkButton>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SkCard>

                    {board.remote_hub && (
                        <SkCard>
                            <SkCardHeader icon="warehouse" title={`${board.remote_hub.name}: to send (${board.to_accept.length})`} />
                            {board.to_accept.length === 0 ? (
                                <EmptyState icon="check_circle" title="Nothing approved to send" description="Refills the store manager approves from the Remote Hub appear here." />
                            ) : (
                                <ul className="divide-y divide-outline-variant/60">
                                    {board.to_accept.map((row) => (
                                        <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-[15px] font-bold text-on-surface">{row.item_name}</p>
                                                    {row.urgent && <StatusPill tone="error" label="Crit low" size="sm" />}
                                                </div>
                                                <p className="text-[13px] text-on-surface-variant">
                                                    <b className="text-on-surface">{row.display}</b> to the store floor · <span className="font-mono">{row.reference}</span>
                                                </p>
                                            </div>
                                            {row.can.accept && (
                                                <SkButton icon="approval" disabled={busy !== null} onClick={() => post(`accept-${row.id}`, route("stock_keeper.refills.accept", row.id))}>
                                                    Accept
                                                </SkButton>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SkCard>
                    )}
                </div>

                <div className="flex flex-col gap-4 lg:gap-6">
                    <SkCard>
                        <SkCardHeader icon="trending_down" title={`Needs a refill (${board.needs.length})`} />
                        {board.needs.length === 0 ? (
                            <EmptyState icon="check_circle" title="Every bin is covered" description="Shelf items at their refill line with nothing on its way show here." />
                        ) : (
                            <ul className="divide-y divide-outline-variant/60">
                                {board.needs.map((need) => (
                                    <li key={need.item_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-[15px] font-bold text-on-surface">{need.name}</p>
                                                <StatusPill tone={NEED[need.status].tone} label={NEED[need.status].label} size="sm" />
                                            </div>
                                            <p className="text-[13px] text-on-surface-variant">
                                                <b className="text-on-surface">{need.display || "Nothing"}</b> on the shelf
                                                {need.band ? ` · refill at ${need.band.refill}, max ${need.band.max} ${need.unit.toLowerCase()}` : ""}
                                            </p>
                                        </div>
                                        {board.can_raise && (
                                            <div className="flex gap-2">
                                                <SkButton variant="outline" icon="add" disabled={busy !== null} onClick={() => post(`raise-${need.item_id}`, route("stock_keeper.shelves.refill", { location: shelfId, item: need.item_id }))} className="flex-1 sm:flex-none">
                                                    Raise refill
                                                </SkButton>
                                                <SkButton
                                                    variant="ghost"
                                                    disabled={busy !== null}
                                                    title="The floor's count is wrong: skip it and ask the Remote Hub, or a shipment"
                                                    onClick={() => post(`skip-${need.item_id}`, route("stock_keeper.shelves.refill", { location: shelfId, item: need.item_id }), { start_at: board.remote_hub ? "remote_hub" : "shipment" })}
                                                >
                                                    Floor is empty
                                                </SkButton>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SkCard>

                    <SkCard>
                        <SkCardHeader icon="history" title={`My requests (${board.my_requests.length})`} />
                        {board.my_requests.length === 0 ? (
                            <EmptyState icon="history" title="No requests yet" description="What the store floor can't cover goes to the store manager; you'll see here what they decide." />
                        ) : (
                            <ul className="divide-y divide-outline-variant/60">
                                {board.my_requests.map((row) => {
                                    const status = fate(row);
                                    return (
                                        <li key={row.id} className="px-4 py-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <p className="truncate text-[15px] font-bold text-on-surface">{row.item_name}</p>
                                                    {row.urgent && row.stage === "waiting" && <StatusPill tone="error" label="Crit low" size="sm" />}
                                                </div>
                                                <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">
                                                    {row.origin === "manual" ? (row.raised_by ?? "Stock keeper") : "Auto"} · {row.reference}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-on-surface-variant">
                                                {row.adjusted ? `You asked for ${row.requested_display}; ${row.display} ${row.stage === "waiting" ? "set by the manager" : "were sent"}` : row.display}
                                                {row.target ? ` for ${row.target.name}` : ""}
                                            </p>
                                            <div className="mt-1.5">
                                                <StatusPill tone={status.tone} label={status.text} icon={status.icon} className="h-auto whitespace-normal" />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </SkCard>
                </div>
            </div>
        </>
    );
}

Shelving.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
