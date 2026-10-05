import SellerLayout from "@/Layouts/SellerLayout";
import type { RefillRow, RefillStage, RefillWaitingList } from "@/types/refills";
import { Head, Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

interface Props {
    storeId: number;
    board?: RefillWaitingList | null;
}

type Tab = "waiting" | "remote" | "moving" | "closed";

const TABS: Array<{ key: Tab; label: string; count: (c: RefillWaitingList["counts"]) => number | null }> = [
    { key: "waiting", label: "Suggestions", count: (c) => c.pending },
    { key: "remote", label: "Remote Hub list", count: (c) => c.remote_to_accept },
    { key: "moving", label: "On its way", count: (c) => c.in_progress - c.remote_to_accept },
    { key: "closed", label: "Closed", count: () => null },
];

const inTab = (row: RefillRow, tab: Tab): boolean => {
    switch (tab) {
        case "waiting":
            return row.stage === "waiting";
        case "remote":
            return row.stage === "remote_list";
        case "moving":
            return row.stage === "remote_on_way" || row.stage === "on_manifest";
        case "closed":
            return row.stage === "landed" || row.stage === "cancelled";
    }
};

const EMPTY: Record<Tab, string> = {
    waiting: "No suggestions. Stock keepers' requests and bins hitting their refill line land here.",
    remote: "Nothing on the Remote Hub list waiting for the hub to accept.",
    moving: "Nothing is on its way.",
    closed: "Nothing closed yet.",
};

const STAGE_CHIP: Record<RefillStage, { label: string; cls: string }> = {
    waiting: { label: "Suggestion", cls: "bg-warning-container text-on-warning-container" },
    remote_list: { label: "Hub to accept", cls: "bg-info-container text-on-info-container" },
    remote_on_way: { label: "From Remote Hub", cls: "bg-success-container text-on-success-container" },
    on_manifest: { label: "On a manifest", cls: "bg-success-container text-on-success-container" },
    landed: { label: "Done", cls: "bg-surface-container text-on-surface-variant" },
    cancelled: { label: "Cancelled", cls: "bg-surface-container text-on-surface-variant" },
};

const when = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not scheduled yet";

/**
 * The refill list: suggestions from stock keepers and the auto trigger for
 * what the store floor could not cover. The store manager puts each on the
 * Remote Hub → Store list or on a shipment from Hub A/B (to the store floor or
 * the Remote Hub), may change the amount, or cancels it. Adding is the
 * approval. Floor refills never wait: they go straight to the shelving list.
 */
export default function RefillsIndex({ storeId, board = null }: Props): React.ReactElement {
    const [tab, setTab] = useState<Tab>("waiting");
    const [busy, setBusy] = useState(false);
    const [hubId, setHubId] = useState<number | null>(board?.hubs[0]?.id ?? null);
    const floor = board?.destinations.find((d) => d.kind === "backroom") ?? null;
    const [destinationId, setDestinationId] = useState<number | null>(floor?.id ?? board?.destinations[0]?.id ?? null);
    const [picked, setPicked] = useState<Record<number, number>>({});

    const rows = useMemo(() => (board?.rows ?? []).filter((row) => inTab(row, tab)), [board, tab]);

    const send = (method: "post" | "patch", url: string, data: Record<string, unknown> = {}, onSuccess?: () => void): void => {
        setBusy(true);
        router[method](url, data as Parameters<typeof router.post>[1], { preserveScroll: true, onSuccess, onFinish: () => setBusy(false) });
    };

    const togglePicked = (row: RefillRow): void =>
        setPicked((current) => {
            const next = { ...current };
            if (row.id in next) delete next[row.id];
            else next[row.id] = row.quantity;
            return next;
        });

    const buildShipment = (): void => {
        const ids = Object.keys(picked).map(Number);
        if (hubId === null || destinationId === null || ids.length === 0) return;
        send(
            "post",
            route("seller.refills.ship"),
            {
                hub_location_id: hubId,
                destination_location_id: destinationId,
                lines: ids.map((id) => {
                    const row = board?.rows.find((r) => r.id === id);
                    return { id, quantity: row && picked[id] !== row.quantity ? picked[id] : null };
                }),
            },
            () => setPicked({}),
        );
    };

    const pickedCount = Object.keys(picked).length;

    return (
        <>
            <Head title="Refill requests" />

            <div className="min-h-screen bg-surface-container-low pb-28">
                <section className="flex items-center justify-between px-4 pb-3 pt-4">
                    <div className="flex min-w-0 items-center space-x-3">
                        <Link
                            href={route("seller.menu.index")}
                            aria-label="Back"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container-high/60 active:scale-95"
                        >
                            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                        </Link>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-primary text-on-primary shadow-sm">
                            <span className="material-symbols-outlined text-2xl">playlist_add_check</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">Refill requests</h1>
                            <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                                {board?.can_rule ? "Send each to the Remote Hub list or a shipment" : "View only · the store manager acts on these"}
                            </p>
                        </div>
                    </div>
                    <Link href={route("seller.refills.permissions")} className="shrink-0 text-[11px] font-semibold text-primary">
                        Who can do what
                    </Link>
                </section>

                <div className="px-3.5">
                    {board && board.counts.urgent > 0 ? (
                        <p className="mb-3 flex items-center space-x-1.5 rounded-[12px] border border-error/30 bg-error-container/60 px-3 py-2 text-[12px] font-semibold text-on-error-container">
                            <span className="material-symbols-outlined text-[16px]">priority_high</span>
                            <span>{board.counts.urgent} suggestion{board.counts.urgent === 1 ? "" : "s"} at crit low</span>
                        </p>
                    ) : null}

                    <nav className="mb-3 flex space-x-1 overflow-x-auto rounded-[14px] bg-surface-container-lowest p-1 shadow-sm" aria-label="Refill request status">
                        {TABS.map((t) => {
                            const count = board ? t.count(board.counts) : null;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTab(t.key)}
                                    aria-pressed={tab === t.key}
                                    className={`flex shrink-0 items-center space-x-1 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold ${
                                        tab === t.key ? "bg-inverse-surface text-inverse-on-surface" : "text-on-surface-variant hover:bg-surface-container"
                                    }`}
                                >
                                    <span>{t.label}</span>
                                    {count ? (
                                        <span className={`rounded-[999px] px-1.5 text-[10px] font-bold ${tab === t.key ? "bg-inverse-on-surface/20" : "bg-primary-container text-on-primary-container"}`}>{count}</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </nav>

                    {tab === "waiting" && board && rows.some((r) => r.can.add_to_manifest) ? (
                        <section className="mb-3 rounded-[16px] border border-primary/30 bg-primary-container/30 px-3 py-2.5">
                            <p className="mb-2 text-[11px] text-on-surface-variant">
                                Tick suggestions to send on a new shipment, or add them to an existing one from its manifest.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <label htmlFor="ship-hub" className="text-[12px] font-semibold text-on-surface-variant">From</label>
                                <select
                                    id="ship-hub"
                                    value={hubId ?? ""}
                                    onChange={(e) => setHubId(e.target.value === "" ? null : Number(e.target.value))}
                                    className="rounded-[8px] border border-outline-variant bg-surface-container-lowest px-2 py-1 text-[12px]"
                                >
                                    {board.hubs.map((hub) => (
                                        <option key={hub.id} value={hub.id}>{hub.name}</option>
                                    ))}
                                </select>
                                <label htmlFor="ship-to" className="text-[12px] font-semibold text-on-surface-variant">to</label>
                                <select
                                    id="ship-to"
                                    value={destinationId ?? ""}
                                    onChange={(e) => setDestinationId(e.target.value === "" ? null : Number(e.target.value))}
                                    className="rounded-[8px] border border-outline-variant bg-surface-container-lowest px-2 py-1 text-[12px]"
                                >
                                    {board.destinations.map((d) => (
                                        <option key={d.id} value={d.id}>{d.kind === "backroom" ? "Store floor" : d.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={buildShipment}
                                    disabled={busy || hubId === null || destinationId === null || pickedCount === 0}
                                    className="ml-auto flex items-center space-x-1 rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-on-primary active:scale-95 disabled:opacity-40"
                                >
                                    <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                                    <span>New shipment ({pickedCount})</span>
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {rows.length === 0 ? (
                        <section className="rounded-[20px] bg-surface-container-lowest px-4 py-8 text-center shadow-sm">
                            <span className="material-symbols-outlined text-[28px] text-outline">inbox</span>
                            <p className="mt-1 text-[12px] text-on-surface-variant">{EMPTY[tab]}</p>
                        </section>
                    ) : (
                        <ul className="space-y-2">
                            {rows.map((row) => (
                                <RefillCard
                                    key={row.id}
                                    row={row}
                                    busy={busy}
                                    picked={row.id in picked ? picked[row.id] : null}
                                    onTogglePicked={() => togglePicked(row)}
                                    onPickedAmount={(value) => setPicked((c) => ({ ...c, [row.id]: Math.max(1, value) }))}
                                    send={send}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </>
    );
}

function RefillCard({
    row,
    busy,
    picked,
    onTogglePicked,
    onPickedAmount,
    send,
}: {
    row: RefillRow;
    busy: boolean;
    /** Amount when ticked for a new shipment; null when not ticked. */
    picked: number | null;
    onTogglePicked: () => void;
    onPickedAmount: (value: number) => void;
    send: (method: "post" | "patch", url: string, data?: Record<string, unknown>, onSuccess?: () => void) => void;
}): React.ReactElement {
    const [quantity, setQuantity] = useState(row.quantity);
    const changed = quantity !== row.quantity;
    const chip = STAGE_CHIP[row.stage];
    const open = row.stage !== "landed" && row.stage !== "cancelled";

    const cancel = (): void => {
        const reason = window.prompt(`Cancel ${row.reference}? Give a reason (the stock keeper sees it):`, "");
        if (reason === null) return;
        send("post", route("seller.refills.cancel", row.id), { reason });
    };

    return (
        <li className={`rounded-[18px] border bg-surface-container-lowest px-3.5 py-3 shadow-sm ${row.urgent && open ? "border-error/30" : "border-outline-variant/60"}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start space-x-2.5">
                    {row.can.add_to_manifest ? (
                        <input
                            type="checkbox"
                            checked={picked !== null}
                            onChange={onTogglePicked}
                            aria-label={`Ship ${row.reference}`}
                            className="mt-1 h-4 w-4 rounded border-outline/50 text-primary focus:ring-primary"
                        />
                    ) : null}
                    <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                            <span className="truncate text-[14px] font-bold text-on-surface">{row.item_name}</span>
                            {row.urgent && open ? <span className="shrink-0 rounded-[999px] bg-error-container px-1.5 py-0.5 text-[10px] font-bold text-on-error-container">Crit low</span> : null}
                        </div>
                        <p className="text-[12px] text-on-surface-variant">
                            <span className="font-semibold text-on-surface">{row.display}</span>
                            {row.adjusted ? <span className="text-on-surface-variant"> (asked {row.requested_display})</span> : null}
                            {" for "}
                            {row.target?.name ?? "the shelf"}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-outline">
                            {row.reference} · {row.origin === "manual" ? `asked by ${row.raised_by ?? "a stock keeper"}` : "raised automatically"}
                            {row.added_by ? ` · added by ${row.added_by}` : ""}
                        </p>
                        {row.shipment ? (
                            <p className="mt-0.5 text-[11px] text-on-surface-variant">
                                On {row.shipment.reference} {row.destination === "remote_hub" ? "to the Remote Hub" : "to the store floor"} · {when(row.shipment.scheduled_for)}
                            </p>
                        ) : null}
                        {row.transfer ? <p className="mt-0.5 text-[11px] text-on-surface-variant">{row.transfer.reference} · {row.transfer.status.replace("_", " ")}</p> : null}
                        {row.cancel_reason ? <p className="mt-0.5 text-[11px] italic text-on-surface-variant">{row.cancelled_by ? `${row.cancelled_by}: ` : ""}{row.cancel_reason}</p> : null}
                    </div>
                </div>
                <span className={`shrink-0 rounded-[999px] px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>
            </div>

            {picked !== null ? (
                <label className="mt-2 flex items-center space-x-1.5 text-[12px] text-on-surface-variant">
                    <span>Ship</span>
                    <input
                        type="number"
                        min={1}
                        value={picked}
                        disabled={!row.can.update}
                        onChange={(e) => onPickedAmount(Number(e.target.value) || 1)}
                        className="w-20 rounded-[8px] border border-outline-variant px-2 py-1 text-[12px] disabled:bg-surface-container"
                    />
                    <span>{row.unit.toLowerCase()} on the new shipment</span>
                </label>
            ) : null}

            {row.can.add_to_remote || row.can.cancel || row.can.accept || row.can.update ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-outline-variant/60 pt-2.5">
                    {row.can.update ? (
                        <label className="flex items-center space-x-1.5 text-[12px] text-on-surface-variant">
                            <span>Qty</span>
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                                className="w-20 rounded-[8px] border border-outline-variant px-2 py-1 text-[12px]"
                            />
                            <span>{row.unit.toLowerCase()}</span>
                        </label>
                    ) : null}
                    <span className="ml-auto flex items-center gap-2">
                        {row.can.update && changed ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => send("patch", route("seller.refills.update", row.id), { quantity })}
                                className="rounded-[10px] border border-outline-variant px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant active:scale-95 disabled:opacity-40"
                            >
                                Save amount
                            </button>
                        ) : null}
                        {row.can.cancel ? (
                            <button type="button" disabled={busy} onClick={cancel} className="rounded-[10px] border border-outline-variant px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant active:scale-95 disabled:opacity-40">
                                Cancel
                            </button>
                        ) : null}
                        {row.can.add_to_remote ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => send("post", route("seller.refills.remote", row.id), changed ? { quantity } : {})}
                                className="rounded-[10px] bg-inverse-surface px-3 py-1.5 text-[12px] font-bold text-inverse-on-surface active:scale-95 disabled:opacity-40"
                            >
                                {changed ? `Remote Hub list · ${quantity}` : "Add to Remote Hub list"}
                            </button>
                        ) : null}
                        {row.can.accept ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => send("post", route("seller.refills.accept", row.id))}
                                className="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-on-primary active:scale-95 disabled:opacity-40"
                            >
                                Accept at hub
                            </button>
                        ) : null}
                    </span>
                </div>
            ) : null}
        </li>
    );
}

RefillsIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
