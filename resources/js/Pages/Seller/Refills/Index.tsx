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
    waiting: { label: "Suggestion", cls: "bg-amber-100 text-amber-800" },
    remote_list: { label: "Hub to accept", cls: "bg-sky-100 text-sky-800" },
    remote_on_way: { label: "From Remote Hub", cls: "bg-emerald-100 text-emerald-800" },
    on_manifest: { label: "On a manifest", cls: "bg-emerald-100 text-emerald-800" },
    landed: { label: "Done", cls: "bg-gray-100 text-gray-600" },
    cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-500" },
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

            <div className="min-h-screen bg-[#F8F9FB] pb-28">
                <section className="flex items-center justify-between px-4 pb-3 pt-4">
                    <div className="flex min-w-0 items-center space-x-3">
                        <Link
                            href={route("seller.menu.index")}
                            aria-label="Back"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-gray-700 hover:bg-gray-200/60 active:scale-95"
                        >
                            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                        </Link>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#c2410c] text-white shadow-sm">
                            <span className="material-symbols-outlined text-2xl">playlist_add_check</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-[17px] font-bold tracking-tight text-[#0b1c30]">Refill requests</h1>
                            <p className="mt-0.5 truncate text-[11px] text-gray-500">
                                {board?.can_rule ? "Send each to the Remote Hub list or a shipment" : "View only · the store manager acts on these"}
                            </p>
                        </div>
                    </div>
                    <Link href={route("seller.refills.permissions")} className="shrink-0 text-[11px] font-semibold text-[#c2410c]">
                        Who can do what
                    </Link>
                </section>

                <div className="px-3.5">
                    {board && board.counts.urgent > 0 ? (
                        <p className="mb-3 flex items-center space-x-1.5 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
                            <span className="material-symbols-outlined text-[16px]">priority_high</span>
                            <span>{board.counts.urgent} suggestion{board.counts.urgent === 1 ? "" : "s"} at crit low</span>
                        </p>
                    ) : null}

                    <nav className="mb-3 flex space-x-1 overflow-x-auto rounded-[14px] bg-white p-1 shadow-sm" aria-label="Refill request status">
                        {TABS.map((t) => {
                            const count = board ? t.count(board.counts) : null;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTab(t.key)}
                                    aria-pressed={tab === t.key}
                                    className={`flex shrink-0 items-center space-x-1 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold ${
                                        tab === t.key ? "bg-[#0b1c30] text-white" : "text-gray-600 hover:bg-gray-100"
                                    }`}
                                >
                                    <span>{t.label}</span>
                                    {count ? (
                                        <span className={`rounded-[999px] px-1.5 text-[10px] font-bold ${tab === t.key ? "bg-white/20" : "bg-orange-100 text-[#c2410c]"}`}>{count}</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </nav>

                    {tab === "waiting" && board && rows.some((r) => r.can.add_to_manifest) ? (
                        <section className="mb-3 rounded-[16px] border border-orange-200 bg-orange-50/50 px-3 py-2.5">
                            <p className="mb-2 text-[11px] text-gray-600">
                                Tick suggestions to send on a new shipment, or add them to an existing one from its manifest.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <label htmlFor="ship-hub" className="text-[12px] font-semibold text-gray-700">From</label>
                                <select
                                    id="ship-hub"
                                    value={hubId ?? ""}
                                    onChange={(e) => setHubId(e.target.value === "" ? null : Number(e.target.value))}
                                    className="rounded-[8px] border border-gray-200 bg-white px-2 py-1 text-[12px]"
                                >
                                    {board.hubs.map((hub) => (
                                        <option key={hub.id} value={hub.id}>{hub.name}</option>
                                    ))}
                                </select>
                                <label htmlFor="ship-to" className="text-[12px] font-semibold text-gray-700">to</label>
                                <select
                                    id="ship-to"
                                    value={destinationId ?? ""}
                                    onChange={(e) => setDestinationId(e.target.value === "" ? null : Number(e.target.value))}
                                    className="rounded-[8px] border border-gray-200 bg-white px-2 py-1 text-[12px]"
                                >
                                    {board.destinations.map((d) => (
                                        <option key={d.id} value={d.id}>{d.kind === "backroom" ? "Store floor" : d.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={buildShipment}
                                    disabled={busy || hubId === null || destinationId === null || pickedCount === 0}
                                    className="ml-auto flex items-center space-x-1 rounded-[10px] bg-[#c2410c] px-3 py-1.5 text-[12px] font-bold text-white active:scale-95 disabled:opacity-40"
                                >
                                    <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                                    <span>New shipment ({pickedCount})</span>
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {rows.length === 0 ? (
                        <section className="rounded-[20px] bg-white px-4 py-8 text-center shadow-sm">
                            <span className="material-symbols-outlined text-[28px] text-gray-300">inbox</span>
                            <p className="mt-1 text-[12px] text-gray-500">{EMPTY[tab]}</p>
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
        <li className={`rounded-[18px] border bg-white px-3.5 py-3 shadow-sm ${row.urgent && open ? "border-rose-200" : "border-gray-100"}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start space-x-2.5">
                    {row.can.add_to_manifest ? (
                        <input
                            type="checkbox"
                            checked={picked !== null}
                            onChange={onTogglePicked}
                            aria-label={`Ship ${row.reference}`}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-[#c2410c] focus:ring-[#c2410c]"
                        />
                    ) : null}
                    <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                            <span className="truncate text-[14px] font-bold text-[#0b1c30]">{row.item_name}</span>
                            {row.urgent && open ? <span className="shrink-0 rounded-[999px] bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Crit low</span> : null}
                        </div>
                        <p className="text-[12px] text-gray-600">
                            <span className="font-semibold text-gray-900">{row.display}</span>
                            {row.adjusted ? <span className="text-gray-500"> (asked {row.requested_display})</span> : null}
                            {" for "}
                            {row.target?.name ?? "the shelf"}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-gray-400">
                            {row.reference} · {row.origin === "manual" ? `asked by ${row.raised_by ?? "a stock keeper"}` : "raised automatically"}
                            {row.added_by ? ` · added by ${row.added_by}` : ""}
                        </p>
                        {row.shipment ? (
                            <p className="mt-0.5 text-[11px] text-gray-600">
                                On {row.shipment.reference} {row.destination === "remote_hub" ? "to the Remote Hub" : "to the store floor"} · {when(row.shipment.scheduled_for)}
                            </p>
                        ) : null}
                        {row.transfer ? <p className="mt-0.5 text-[11px] text-gray-600">{row.transfer.reference} · {row.transfer.status.replace("_", " ")}</p> : null}
                        {row.cancel_reason ? <p className="mt-0.5 text-[11px] italic text-gray-500">{row.cancelled_by ? `${row.cancelled_by}: ` : ""}{row.cancel_reason}</p> : null}
                    </div>
                </div>
                <span className={`shrink-0 rounded-[999px] px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>
            </div>

            {picked !== null ? (
                <label className="mt-2 flex items-center space-x-1.5 text-[12px] text-gray-600">
                    <span>Ship</span>
                    <input
                        type="number"
                        min={1}
                        value={picked}
                        disabled={!row.can.update}
                        onChange={(e) => onPickedAmount(Number(e.target.value) || 1)}
                        className="w-20 rounded-[8px] border border-gray-200 px-2 py-1 text-[12px] disabled:bg-gray-100"
                    />
                    <span>{row.unit.toLowerCase()} on the new shipment</span>
                </label>
            ) : null}

            {row.can.add_to_remote || row.can.cancel || row.can.accept || row.can.update ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
                    {row.can.update ? (
                        <label className="flex items-center space-x-1.5 text-[12px] text-gray-600">
                            <span>Qty</span>
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                                className="w-20 rounded-[8px] border border-gray-200 px-2 py-1 text-[12px]"
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
                                className="rounded-[10px] border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 active:scale-95 disabled:opacity-40"
                            >
                                Save amount
                            </button>
                        ) : null}
                        {row.can.cancel ? (
                            <button type="button" disabled={busy} onClick={cancel} className="rounded-[10px] border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 active:scale-95 disabled:opacity-40">
                                Cancel
                            </button>
                        ) : null}
                        {row.can.add_to_remote ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => send("post", route("seller.refills.remote", row.id), changed ? { quantity } : {})}
                                className="rounded-[10px] bg-[#0b1c30] px-3 py-1.5 text-[12px] font-bold text-white active:scale-95 disabled:opacity-40"
                            >
                                {changed ? `Remote Hub list · ${quantity}` : "Add to Remote Hub list"}
                            </button>
                        ) : null}
                        {row.can.accept ? (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => send("post", route("seller.refills.accept", row.id))}
                                className="rounded-[10px] bg-[#c2410c] px-3 py-1.5 text-[12px] font-bold text-white active:scale-95 disabled:opacity-40"
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
