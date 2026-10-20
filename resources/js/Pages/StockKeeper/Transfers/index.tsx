import { Head, Link, router, useForm } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import ItemVariantPicker from "@/Components/StockKeeper/ItemVariantPicker";
import TransferReceiveSheet from "@/Components/StockKeeper/TransferReceiveSheet";
import { calendarPrefill, dayLabel } from "@/Components/Calendar/calendarPrefill";
import { KIND_LABEL, SkButton, SkCard, SkChips, SkField, SkHeader, SkPager, SkSheet, SkStats, fmt, inputClass, when } from "@/Components/StockKeeper/skKit";
import type { StockKeeperTransfersProps, StockLocation, TransferRow, TransferStatus } from "@/types/stockkeeper";

type StatusFilter = "all" | TransferStatus;

const STATUS: Record<TransferStatus, { label: string; tone: Tone; icon: string }> = {
    pending: { label: "Queued", tone: "warning", icon: "schedule" },
    in_transit: { label: "In transit", tone: "info", icon: "local_shipping" },
    completed: { label: "Completed", tone: "success", icon: "task_alt" },
    cancelled: { label: "Cancelled", tone: "neutral", icon: "block" },
};

/** "App\Models\…#12": the pair the server resolves to a location. */
const pairOf = (location: StockLocation): string => `${location.type}#${location.id}`;

/**
 * Transfers: one item moved between two places, such as store floor → Store
 * Shelf or Remote Hub → store (a courier carries those). Stock leaves at
 * dispatch and lands when it is received, with any shortfall logged under
 * Receiving.
 */
export default function Transfers({ transfers = [], filters, counts, locations = [], pagination }: StockKeeperTransfersProps): React.ReactElement {
    // Started from a day on the calendar: open the sheet with that day in.
    const [prefill] = React.useState(calendarPrefill);
    const [createOpen, setCreateOpen] = React.useState(prefill.open);
    const [receiving, setReceiving] = React.useState<TransferRow | null>(null);
    const [busy, setBusy] = React.useState<number | null>(null);
    const status = (filters.status || "all") as StatusFilter;

    const go = (next: { status?: StatusFilter; page?: number }) => {
        const s = next.status ?? status;
        router.get(route("stock_keeper.transfers.index"), { ...(s !== "all" ? { status: s } : {}), ...(next.page ? { page: next.page } : {}) }, { preserveState: true, preserveScroll: true, replace: true });
    };

    const act = (transfer: TransferRow, action: "dispatch" | "cancel") => {
        setBusy(transfer.id);
        router.post(route(`stock_keeper.transfers.${action}`, transfer.id), {}, { preserveScroll: true, onFinish: () => setBusy(null) });
    };

    return (
        <>
            <Head title="Transfers" />

            <SkHeader
                title="Transfers"
                subtitle="One item between two places. Stock leaves when it's sent and lands when it's received."
                actions={
                    <SkButton icon="add" onClick={() => setCreateOpen(true)}>
                        Raise transfer
                    </SkButton>
                }
            />

            <SkStats
                items={[
                    { label: "Queued", value: fmt(counts.pending), icon: "schedule", tone: counts.pending > 0 ? "warning" : undefined },
                    { label: "In transit", value: fmt(counts.in_transit), icon: "local_shipping" },
                    { label: "Completed", value: fmt(counts.completed), icon: "task_alt", tone: "success" },
                    { label: "All transfers", value: fmt(counts.all), icon: "swap_horiz" },
                ]}
            />

            <div className="mb-3">
                <SkChips<StatusFilter>
                    value={status}
                    onChange={(v) => go({ status: v, page: 1 })}
                    options={[
                        { value: "all", label: "All", count: counts.all },
                        { value: "pending", label: "Queued", count: counts.pending },
                        { value: "in_transit", label: "In transit", count: counts.in_transit },
                        { value: "completed", label: "Completed", count: counts.completed },
                        { value: "cancelled", label: "Cancelled", count: counts.cancelled },
                    ]}
                />
            </div>

            {transfers.length === 0 ? (
                <EmptyState icon="swap_horiz" title="No transfers here" description="Raise one to move an item between places." framed />
            ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {transfers.map((t) => {
                        const s = STATUS[t.status];
                        const from = t.source_label ?? t.from_store ?? "—";
                        const to = t.destination_label ?? t.to_store ?? "—";
                        const waitingCourier = Boolean(t.needs_courier && !t.courier);
                        return (
                            <li key={t.id}>
                                <SkCard className="flex h-full flex-col p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-bold text-on-surface">{t.product_name}</p>
                                            <p className="truncate font-mono text-[11px] text-on-surface-variant">
                                                {t.reference} · {t.sku ?? "—"}
                                            </p>
                                        </div>
                                        <StatusPill tone={s.tone} label={s.label} icon={s.icon} />
                                    </div>

                                    <p className="mt-2 text-[24px] font-extrabold leading-none tabular-nums text-on-surface">{fmt(t.quantity)}</p>

                                    {/* The route, from → to. */}
                                    <div className="mt-3 flex items-stretch gap-2 rounded-[14px] bg-surface-container-low p-2.5">
                                        <div className="flex flex-col items-center py-1">
                                            <span className="h-2.5 w-2.5 rounded-[999px] border-2 border-primary" />
                                            <span className="my-0.5 w-0.5 flex-1 bg-outline-variant" />
                                            <span className="h-2.5 w-2.5 rounded-[999px] bg-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1 text-[13px]">
                                            <p className="truncate text-on-surface-variant">
                                                From <b className="text-on-surface">{from}</b>
                                            </p>
                                            <p className="mt-1.5 truncate text-on-surface-variant">
                                                To <b className="text-on-surface">{to}</b>
                                            </p>
                                        </div>
                                    </div>

                                    {t.needs_courier && (
                                        <p className={`mt-2 flex items-center gap-1.5 text-[13px] ${t.courier ? "text-on-surface-variant" : "font-bold text-warning"}`}>
                                            <span className="material-symbols-outlined text-[18px]">delivery_truck_speed</span>
                                            {t.courier ? `Courier: ${t.courier}` : "Waiting for a courier to claim it"}
                                            {t.handed_over_at && t.status === "in_transit" ? " · handed over: check it and receive it" : ""}
                                        </p>
                                    )}
                                    {t.eta && t.status === "pending" && (
                                        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-on-surface-variant">
                                            <span className="material-symbols-outlined text-[18px]">event</span>
                                            Planned for <b className="text-on-surface">{dayLabel(t.eta)}</b>
                                        </p>
                                    )}
                                    {t.notes && <p className="mt-2 rounded-[10px] bg-surface-container-low px-2.5 py-1.5 text-[13px] text-on-surface-variant">“{t.notes}”</p>}

                                    <p className="mt-2 text-[12px] text-on-surface-variant">
                                        Raised {when(t.created_at)}
                                        {t.initiated_by ? ` by ${t.initiated_by}` : ""}
                                        {t.completed_at ? ` · landed ${when(t.completed_at)}` : t.dispatched_at ? ` · sent ${when(t.dispatched_at)}` : ""}
                                    </p>

                                    {(t.status === "pending" || t.status === "in_transit") && (
                                        <div className="mt-auto flex gap-2 pt-3">
                                            {t.status === "pending" && (
                                                <SkButton icon="send" disabled={busy !== null || waitingCourier} onClick={() => act(t, "dispatch")} className="flex-1">
                                                    {t.needs_courier ? "Hand to courier" : "Send"}
                                                </SkButton>
                                            )}
                                            {t.status === "in_transit" && (
                                                <SkButton variant="success" icon="move_to_inbox" disabled={busy !== null} onClick={() => setReceiving(t)} className="flex-1">
                                                    Receive
                                                </SkButton>
                                            )}
                                            <SkButton variant="danger" disabled={busy !== null} onClick={() => act(t, "cancel")}>
                                                Cancel
                                            </SkButton>
                                        </div>
                                    )}
                                </SkCard>
                            </li>
                        );
                    })}
                </ul>
            )}

            <SkPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} noun="transfers" onPage={(page) => go({ page })} />

            <p className="mt-4 text-center text-[12px] text-on-surface-variant">
                Hub runs of many items are <Link href={route("stock_keeper.shipments.index")} className="font-bold text-primary hover:underline">shipments</Link>; customer orders leave as{" "}
                <Link href={route("stock_keeper.orders.index")} className="font-bold text-primary hover:underline">deliveries</Link>.
            </p>

            <RaiseSheet open={createOpen} onClose={() => setCreateOpen(false)} locations={locations} plannedFor={prefill.date} />
            {receiving && <TransferReceiveSheet transfer={receiving} onClose={() => setReceiving(null)} />}
        </>
    );
}

function RaiseSheet({ open, onClose, locations, plannedFor = null }: { open: boolean; onClose: () => void; locations: StockLocation[]; plannedFor?: string | null }) {
    const form = useForm<{ item_variant_id: number | ""; from: string; to: string; quantity: number | ""; eta: string; notes: string }>({
        item_variant_id: "",
        from: "",
        to: "",
        quantity: 1,
        eta: plannedFor ?? "",
        notes: "",
    });

    // The pick lists carry "type#id"; the server takes the pair split out.
    form.transform((data) => {
        const [sourceType, sourceId] = data.from.split("#");
        const [destinationType, destinationId] = data.to.split("#");
        return {
            item_variant_id: data.item_variant_id,
            quantity: data.quantity,
            eta: data.eta === "" ? null : data.eta,
            notes: data.notes,
            source_location_type: sourceType || null,
            source_location_id: sourceId ? Number(sourceId) : null,
            destination_location_type: destinationType || null,
            destination_location_id: destinationId ? Number(destinationId) : null,
        };
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route("stock_keeper.transfers.store"), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                onClose();
            },
        });
    };

    // The server reports against the fields it received, not the form's.
    const errors = form.errors as Record<string, string | undefined>;
    const fromError = errors.source_location_id ?? errors.from_store_id;
    const toError = errors.destination_location_id ?? errors.to_store_id;
    const option = (l: StockLocation) => `${l.name} · ${KIND_LABEL[l.kind] ?? l.kind}`;

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            title="Raise a transfer"
            subtitle="One item between two places."
            footer={
                <>
                    <SkButton variant="ghost" onClick={onClose}>Cancel</SkButton>
                    <SkButton type="submit" form="sk-raise" disabled={form.processing || form.data.item_variant_id === ""}>Raise transfer</SkButton>
                </>
            }
        >
            <form id="sk-raise" onSubmit={submit} className="flex flex-col gap-3">
                <ItemVariantPicker open={open} value={form.data.item_variant_id} onChange={(id) => form.setData("item_variant_id", id)} error={errors.item_variant_id} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SkField label="From" error={fromError} hint="A whole store sends from its floor.">
                        <select value={form.data.from} onChange={(e) => form.setData("from", e.target.value)} className={inputClass}>
                            <option value="">Choose…</option>
                            {locations.map((l) => (
                                <option key={pairOf(l)} value={pairOf(l)}>
                                    {option(l)}
                                </option>
                            ))}
                        </select>
                    </SkField>
                    <SkField label="To" error={toError} hint="e.g. a store floor to its Store Shelf.">
                        <select value={form.data.to} onChange={(e) => form.setData("to", e.target.value)} className={inputClass}>
                            <option value="">Choose…</option>
                            {locations.map((l) => (
                                <option key={pairOf(l)} value={pairOf(l)}>
                                    {option(l)}
                                </option>
                            ))}
                        </select>
                    </SkField>
                </div>
                <SkField label="Quantity" error={errors.quantity} hint="In the SKU's own packaging.">
                    <input type="number" min={1} inputMode="numeric" value={form.data.quantity} onChange={(e) => form.setData("quantity", e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
                </SkField>
                <SkField label="Planned for (optional)" error={errors.eta} hint="Shows on the calendar on this day.">
                    <input type="date" value={form.data.eta} onChange={(e) => form.setData("eta", e.target.value)} className={inputClass} />
                </SkField>
                <SkField label="Notes (optional)" error={errors.notes}>
                    <textarea rows={2} value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} className={inputClass} />
                </SkField>
            </form>
        </SkSheet>
    );
}

Transfers.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
