import SellerLayout from "@/Layouts/SellerLayout";
import { ABOVE_NAV, birr } from "@/Data/sellerOrderFlow";
import type { PickPackLine, PickPackPlan, SourceRef, SourcingOption } from "@/types/sourcing";
import { Head, Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Pick & pack for a paid order — the real sourcing step.
 *
 * A paid order knows what was sold and which store sold it. It does not know
 * where the goods are, and here that is a real question: a store holds stock on
 * its shop floor, in its back room, at its remote warehouse and at a hub. So
 * each line names the exact location it is picked from, chosen from the places
 * that actually hold it, and the order only moves to "To Deliver" once every
 * line has one. The Delivery that follows originates from that location.
 *
 * Every figure here comes from the server (App\Services\Fulfillment\
 * OrderSourcingService::pickPackPlan); nothing about availability is computed in
 * the browser, so a location cannot be offered that has nothing on it.
 *
 * The screen walks the picker through it in order: choose where each line
 * comes from, tick it once it is in hand, check the parcel is packed, then
 * hand it to delivery, which opens the next paid order in the queue. Ticks and
 * "packed" are saved on the order (PickProgressController), so a stock keeper
 * can carry on where a seller stopped and the courier sees it coming.
 *
 * An order still in To pay cannot be picked at all. One in Pick & pack whose
 * payment was changed (credit swapped for cash, say) can still be picked, but
 * not handed to delivery until the new money is confirmed.
 */

interface QueuedOrder {
    reference: string;
    customer: string;
    lines: number;
    paid_at: string | null;
}

interface Props {
    reference?: string;
    /** Null when no order matches the reference — see the empty state below. */
    plan?: PickPackPlan | null;
    /** Other paid orders waiting at this store, oldest first. */
    queue?: QueuedOrder[];
}

const STEPS = [
    { id: "paid", label: "Paid", icon: "payments" },
    { id: "source", label: "Choose", icon: "where_to_vote" },
    { id: "pick", label: "Pick", icon: "back_hand" },
    { id: "pack", label: "Pack", icon: "package_2" },
    { id: "deliver", label: "Delivery", icon: "local_shipping" },
] as const;

/** Icon per level of the hierarchy, nearest the customer first. */
const LEVEL_ICONS: Record<string, string> = {
    shelf: "storefront",
    backroom: "inventory_2",
    store: "store",
    remote_warehouse: "warehouse",
    main_warehouse: "factory",
    other: "location_on",
};

const sameSource = (a: SourceRef | null, b: SourceRef | null): boolean =>
    a !== null && b !== null && a.location_type === b.location_type && a.location_id === b.location_id;

const optionRef = (option: SourcingOption): SourceRef => ({
    location_type: option.location_type,
    location_id: option.location_id,
});

export default function PickPack({ reference, plan = null, queue = [] }: Props): React.ReactElement {
    /** The location chosen per line, seeded from what the server suggests. */
    const [choices, setChoices] = useState<Record<number, SourceRef | null>>(() => {
        const seed: Record<number, SourceRef | null> = {};
        plan?.lines.forEach((line) => {
            seed[line.id] = line.confirmed_source ?? line.suggested_source ?? null;
        });
        return seed;
    });

    const [submitting, setSubmitting] = useState(false);
    /** Lines the picker has in hand, saved on the order as they are ticked. */
    const [picked, setPickedMap] = useState<Record<number, boolean>>(() => {
        const seed: Record<number, boolean> = {};
        plan?.lines.forEach((line) => {
            seed[line.id] = line.is_sourced || Boolean(line.ticked_at);
        });
        return seed;
    });
    const [packed, setPackedState] = useState(() => Boolean(plan?.sale.packed_at));

    // Saved without reloading the screen, so the locations chosen here stay.
    const save = (url: string, done: boolean) =>
        router.post(url, { done }, { preserveScroll: true, preserveState: true });

    const setPicked = (lineId: number, value: boolean) => {
        if (!plan) return;
        setPickedMap((current) => ({ ...current, [lineId]: value }));
        setPackedState(false);
        save(route("seller.orders.lines.tick", { sale: plan.sale.id, item: lineId }), value);
    };
    const setPacked = (value: boolean) => {
        if (!plan) return;
        setPackedState(value);
        save(route("seller.orders.packed", { sale: plan.sale.id }), value);
    };

    const stats = useMemo(() => {
        const lines = plan?.lines ?? [];
        const chosen = lines.filter((line) => choices[line.id] != null).length;

        return {
            total: lines.length,
            chosen,
            picked: lines.filter((line) => choices[line.id] != null && picked[line.id]).length,
            units: lines.reduce((sum, line) => sum + line.quantity, 0),
            // A line with nowhere holding enough cannot be sourced at all yet.
            unservable: lines.filter((line) => !line.options.some((option) => option.sufficient)).length,
        };
    }, [plan, choices, picked]);

    if (!plan) {
        return (
            <>
                <Head title="Pick & pack" />
                <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-low px-6 text-center">
                    <span className="material-symbols-outlined text-[44px] text-outline">inventory_2</span>
                    <p className="mt-3 text-[16px] font-bold text-on-surface">
                        Order not found
                    </p>
                    <p className="mt-1 text-[12px] text-on-surface-variant">
                        {reference
                            ? `No paid order matches ${reference}.`
                            : "No reference supplied."}
                    </p>
                    <Link
                        href={`${route("seller.orders.index")}?tab=paid`}
                        className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-on-primary active:scale-95 bg-primary"
                    >
                        Orders to pick
                    </Link>
                </div>
            </>
        );
    }

    const { sale, lines } = plan;
    const allChosen = stats.total > 0 && stats.chosen === stats.total;
    const allPicked = allChosen && stats.picked === stats.total;
    const alreadyConfirmed = sale.sourcing_confirmed_at !== null;
    // Money first: an order whose payment is not confirmed by two people
    // never reaches the shelf (the server refuses it too).
    const awaitingPayment = sale.fulfillment_stage === "awaiting_payment";
    // In Pick & pack, but its payment changed and is not all confirmed: it can
    // be picked, not handed over.
    const unpaid = !awaitingPayment && sale.paid === false;
    const locked = alreadyConfirmed || awaitingPayment;
    const ready = allPicked && packed && !locked && !unpaid;
    const step = alreadyConfirmed ? 4 : awaitingPayment ? 0 : !allChosen ? 1 : !allPicked ? 2 : 3;
    const startedAt = sale.picking_started_at ? new Date(sale.picking_started_at) : null;

    const fillSuggested = () =>
        setChoices((current) => {
            const next = { ...current };
            lines.forEach((line) => {
                if (!next[line.id] && line.suggested_source) next[line.id] = line.suggested_source;
            });
            return next;
        });

    const choose = (lineId: number, option: SourcingOption) => {
        setChoices((current) => ({ ...current, [lineId]: optionRef(option) }));
        // A new place means it has to be picked again.
        if (picked[lineId]) setPicked(lineId, false);
    };

    const confirm = () => {
        if (!ready) return;

        setSubmitting(true);
        router.post(
            route("seller.orders.sourcing.confirm", sale.id),
            {
                lines: lines.map((line) => ({
                    sale_item_id: line.id,
                    location_type: choices[line.id]?.location_type,
                    location_id: choices[line.id]?.location_id,
                    quantity: line.quantity,
                })),
            },
            { onFinish: () => setSubmitting(false) },
        );
    };

    return (
        <>
            <Head title={`Pick & pack · ${sale.reference}`} />

            <div className="min-h-screen bg-surface-container-low pb-[200px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center space-x-3">
                            <button
                                type="button"
                                onClick={() =>
                                    window.history.length > 1
                                        ? window.history.back()
                                        : router.visit(`${route("seller.orders.index")}?tab=paid`)
                                }
                                aria-label="Back"
                                className="-ml-1 p-1 text-on-surface"
                            >
                                <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                            </button>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-bold tracking-tight text-on-surface">
                                    Pick &amp; pack
                                </h1>
                                <p className="truncate font-mono text-[11px] text-outline">
                                    {sale.reference} · {sale.customer ?? "Walk-in"}
                                </p>
                            </div>
                        </div>
                        <span className="shrink-0 rounded-[999px] border border-info/30 bg-info-container/60 px-2 py-0.5 text-[10px] font-bold text-on-info-container">
                            {sale.stage_label}
                        </span>
                    </div>

                    {/* Where this order is in the pick & pack walk. */}
                    <ol className="mt-3 flex items-center">
                        {STEPS.map((entry, index) => {
                            // "Paid" stays open while a changed payment waits.
                            const done = (index < step || (index === step && alreadyConfirmed)) && !(index === 0 && unpaid);
                            const current = index === step && !alreadyConfirmed;

                            return (
                                <li key={entry.id} className="flex flex-1 items-center last:flex-none">
                                    <span className="flex flex-col items-center">
                                        <span
                                            className={`flex h-8 w-8 items-center justify-center rounded-[999px] border-2 ${
                                                done
                                                    ? "border-success bg-success text-on-success"
                                                    : current
                                                      ? "border-primary bg-primary text-on-primary"
                                                      : "border-outline-variant bg-surface-container-lowest text-outline"
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">{done ? "check" : entry.icon}</span>
                                        </span>
                                        <span className={`mt-1 text-[10px] font-bold ${current ? "text-primary" : "text-on-surface-variant"}`}>
                                            {entry.label}
                                        </span>
                                    </span>
                                    {index < STEPS.length - 1 ? (
                                        <span className={`mx-1 mb-4 h-0.5 flex-1 rounded ${index < step ? "bg-success" : "bg-outline-variant"}`} />
                                    ) : null}
                                </li>
                            );
                        })}
                    </ol>
                </header>

                {/* ── What to do now, in one line ── */}
                {!locked ? (
                    <div className="mx-3.5 mt-3 rounded-[14px] bg-primary p-3.5 text-on-primary shadow-md">
                        <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                            Step {step + 1} of {STEPS.length}
                        </p>
                        <p className="mt-0.5 text-[15px] font-extrabold">
                            {step === 1
                                ? `Choose where each of ${stats.total} line(s) comes from`
                                : step === 2
                                  ? `Collect the items: ${stats.picked}/${stats.total} lines in hand`
                                  : "Pack the order and hand it to delivery"}
                        </p>
                        <p className="mt-0.5 text-[11px] opacity-85">
                            {stats.units} item(s) in total · {birr(sale.total_amount)}
                        </p>
                        {step === 1 && lines.some((line) => line.suggested_source && !choices[line.id]) ? (
                            <button
                                type="button"
                                onClick={fillSuggested}
                                className="mt-2.5 inline-flex items-center gap-1 rounded-[999px] bg-on-primary px-3 py-1.5 text-[11px] font-bold text-primary"
                            >
                                <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
                                Use the nearest location for every line
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {awaitingPayment ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-error/30 bg-error-container/60 px-3 py-2.5">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-error">lock</span>
                        <div className="text-[11px] leading-snug text-on-error-container">
                            <p className="font-bold">Not paid yet: do not pick this order.</p>
                            <p>
                                Every payment part has to be confirmed by a second person before it can be picked.
                            </p>
                            <Link href={route("seller.orders.pay", sale.reference)} className="mt-1 inline-block font-bold underline">
                                Open its payment
                            </Link>
                        </div>
                    </div>
                ) : null}

                {unpaid ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-warning/40 bg-warning-container/60 px-3 py-2.5">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-on-warning-container">payments</span>
                        <div className="text-[11px] leading-snug text-on-warning-container">
                            <p className="font-bold">Payment changed: not fully paid.</p>
                            <p>You can keep picking, but it cannot go to delivery until every part is confirmed.</p>
                            <Link href={route("seller.orders.pay", sale.reference)} className="mt-1 inline-block font-bold underline">
                                Open its payment
                            </Link>
                        </div>
                    </div>
                ) : null}

                {!locked ? (
                    <div className="mx-3.5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 py-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-on-surface-variant">
                            <span className="material-symbols-outlined text-[15px]">
                                {startedAt ? "person_play" : "hourglass_empty"}
                            </span>
                            <span className="truncate">
                                {startedAt
                                    ? `Picking since ${startedAt.toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" })}${sale.picking_started_by ? ` · ${sale.picking_started_by}` : ""}`
                                    : "Nobody has started picking yet"}
                            </span>
                        </span>
                        <span className="flex items-center gap-2">
                            {!startedAt ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.post(route("seller.orders.picking.start", sale.id), {}, { preserveScroll: true, preserveState: true })
                                    }
                                    className="rounded-[999px] bg-primary px-3 py-1 text-[11px] font-bold text-on-primary"
                                >
                                    Start picking
                                </button>
                            ) : null}
                            <Link
                                href={route("seller.orders.pay", sale.reference)}
                                className="rounded-[999px] border border-outline/50 px-3 py-1 text-[11px] font-semibold text-on-surface"
                            >
                                Change payment method
                            </Link>
                        </span>
                    </div>
                ) : null}

                {plan.delivery !== undefined && !alreadyConfirmed ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[11px] text-on-surface-variant">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px]">
                            {plan.delivery?.method === "vehicle" ? "local_shipping" : "home_pin"}
                        </span>
                        <div className="min-w-0 flex-1">
                            {plan.delivery === null || (plan.delivery.method === "courier" && !plan.delivery.address) ? (
                                <p className="font-semibold text-on-warning-container">
                                    No delivery details yet. Add them before handing it over.
                                </p>
                            ) : plan.delivery.method === "vehicle" ? (
                                <p>
                                    <strong className="text-on-surface">Vehicle collects</strong> · {plan.delivery.plate ?? "plate not set"}
                                    {plan.delivery.driver_phone ? ` · driver ${plan.delivery.driver_phone}` : ""}
                                </p>
                            ) : (
                                <p className="truncate">
                                    <strong className="text-on-surface">Courier</strong>
                                    {plan.delivery.courier ? ` ${plan.delivery.courier}` : " (any)"} · to {plan.delivery.address}
                                </p>
                            )}
                        </div>
                        <Link href={route("seller.orders.pay", sale.reference)} className="shrink-0 font-bold text-primary">
                            Edit
                        </Link>
                    </div>
                ) : null}

                {alreadyConfirmed ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-success/30 bg-success-container/60 px-3 py-2">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-on-success-container">
                            check_circle
                        </span>
                        <p className="text-[11px] leading-snug text-on-success-container">
                            Sourcing was confirmed and this order has moved on to delivery.
                        </p>
                    </div>
                ) : null}

                {sale.delay_agreed ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-warning/25 bg-warning-container/50 px-3 py-2">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-on-warning-container">
                            schedule
                        </span>
                        <p className="text-[11px] leading-snug text-on-warning-container">
                            The buyer agreed to a longer wait for warehouse-sourced items on this
                            order.
                        </p>
                    </div>
                ) : null}

                {stats.unservable > 0 ? (
                    <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-[10px] border border-error/30 bg-error-container/60 px-3 py-2">
                        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px] text-error">
                            error
                        </span>
                        <p className="text-[11px] leading-snug text-on-error-container">
                            <strong className="font-bold">{stats.unservable} line(s)</strong> have no
                            single location holding the full quantity. Replenish first, or split the
                            order.
                        </p>
                    </div>
                ) : null}

                {/* ── Lines ── */}
                <div className="space-y-3 px-3.5 pt-3">
                    {lines.map((line) => (
                        <LineCard
                            key={line.id}
                            line={line}
                            chosen={choices[line.id] ?? null}
                            disabled={locked}
                            onChoose={(option) => choose(line.id, option)}
                            picked={Boolean(picked[line.id])}
                            onPicked={(value) => setPicked(line.id, value)}
                        />
                    ))}
                </div>

                {/* ── Pack ── */}
                {!locked ? (
                    <label
                        className={`mx-3.5 mt-3 flex cursor-pointer items-center gap-3 rounded-[16px] border p-3.5 ${
                            !allPicked ? "opacity-50" : packed ? "border-success/50 bg-success-container/40" : "border-primary bg-surface-container-lowest"
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={packed}
                            disabled={!allPicked}
                            onChange={(event) => setPacked(event.target.checked)}
                            className="h-5 w-5 rounded accent-[rgb(var(--primary))]"
                        />
                        <span>
                            <span className="block text-[13px] font-bold text-on-surface">Packed and labelled</span>
                            <span className="block text-[11px] text-on-surface-variant">
                                Every line is in the parcel with {sale.reference} on it.
                            </span>
                        </span>
                    </label>
                ) : null}

                {/* ── The rest of the queue ── */}
                {queue.length > 0 ? (
                    <div className="mt-4 px-3.5">
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                            Also waiting to pick · {queue.length}
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {queue.map((entry) => (
                                <Link
                                    key={entry.reference}
                                    href={route("seller.orders.pickpack", entry.reference)}
                                    className="w-[150px] shrink-0 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-2.5"
                                >
                                    <span className="block truncate font-mono text-[11px] font-bold text-on-surface">{entry.reference}</span>
                                    <span className="block truncate text-[11px] text-on-surface-variant">{entry.customer}</span>
                                    <span className="text-[10px] text-outline">{entry.lines} line(s)</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>

            {/* ── Sticky CTA ── */}
            <nav
                className="fixed inset-x-0 z-50 mx-auto max-w-[480px] rounded-t-[16px] border-t border-outline-variant bg-surface-container-lowest px-4 py-2.5 shadow-[0_-4px_16px_rgb(var(--on-surface)/0.08)] dark:shadow-none"
                style={{ bottom: ABOVE_NAV }}
            >
                <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div>
                        <span className="block font-mono text-[11px] text-on-surface-variant">
                            {stats.picked}/{stats.total} picked
                        </span>
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                            {alreadyConfirmed
                                ? "Already with delivery"
                                : awaitingPayment
                                  ? "Waiting for payment"
                                  : unpaid && allPicked && packed
                                    ? "Packed · waiting for payment"
                                    : !allChosen
                                    ? "Choose a location for every line"
                                    : !allPicked
                                      ? "Tick each line once in hand"
                                      : !packed
                                        ? "Tick packed and labelled"
                                        : "Ready to hand over"}
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={!ready || submitting}
                        onClick={confirm}
                        className="max-w-[220px] flex-1 rounded-[999px] px-6 py-3 text-center text-sm font-bold text-on-primary shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 bg-primary"
                    >
                        {submitting ? "Handing over…" : queue.length > 0 ? "Hand to delivery & next" : "Hand to delivery"}
                    </button>
                </div>
            </nav>
        </>
    );
}

interface LineCardProps {
    line: PickPackLine;
    chosen: SourceRef | null;
    disabled: boolean;
    onChoose: (option: SourcingOption) => void;
    picked: boolean;
    onPicked: (picked: boolean) => void;
}

/**
 * One line, with every location that holds it.
 *
 * A location that cannot cover the whole line is shown but not selectable: the
 * server refuses it anyway, and offering it would turn a clear rule into a
 * failed submit.
 */
function LineCard({ line, chosen, disabled, onChoose, picked, onPicked }: LineCardProps): React.ReactElement {
    const settled = chosen !== null && picked;
    const chosenOption = line.options.find((option) => sameSource(chosen, optionRef(option))) ?? null;

    return (
        <div
            className={`rounded-[16px] border bg-surface-container-lowest p-3.5 shadow-sm ${
                settled ? "border-success/40" : "border-outline-variant/60"
            }`}
        >
            {/* Line identity */}
            <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] border border-outline-variant/60 bg-surface-container-low">
                    <span className="material-symbols-outlined text-[22px] text-outline">inventory_2</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-bold leading-snug text-on-surface">
                        {line.title}
                    </p>
                    <span className="mt-1 inline-flex max-w-full items-center gap-0.5 rounded-[6px] border border-primary/30 bg-primary-container/40 px-1.5 py-0.5 text-[11px] font-semibold text-on-surface">
                        <span className="material-symbols-outlined text-[13px] text-primary">sell</span>
                        <span className="truncate">{line.variant_label}</span>
                    </span>
                    <p className="mt-0.5 text-[15px] font-extrabold text-on-surface">×{line.quantity}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-outline">{birr(line.line_total)}</p>
                </div>
                {line.is_sourced ? (
                    <span className="shrink-0 rounded-[999px] border border-success/30 bg-success-container/60 px-2 py-0.5 text-[9px] font-bold uppercase text-on-success-container">
                        Picked
                    </span>
                ) : null}
            </div>

            {/* Where it is picked from */}
            <div className="mt-3 border-t border-outline-variant/60 pt-2.5">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                    Pick from
                </p>

                <div className="space-y-1.5">
                    {line.options.map((option) => {
                        const active = sameSource(chosen, optionRef(option));
                        const selectable = option.sufficient && !disabled;

                        return (
                            <button
                                key={`${option.location_type}#${option.location_id}`}
                                type="button"
                                disabled={!selectable}
                                title={
                                    option.sufficient
                                        ? undefined
                                        : `Only ${option.on_hand} here — not enough for this line`
                                }
                                onClick={() => onChoose(option)}
                                className={`flex w-full items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                                    active
                                        ? "border-primary bg-primary-container/35"
                                        : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                            >
                                <span
                                    className={`material-symbols-outlined text-[18px] ${active ? "text-primary" : "text-outline"}`}
                                >
                                    {LEVEL_ICONS[option.kind] ?? LEVEL_ICONS.other}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span
                                        className={`block truncate text-[11px] font-bold ${
                                            active ? "text-on-surface" : "text-on-surface-variant"
                                        }`}
                                    >
                                        {option.level_label}
                                        <span className="font-medium text-outline"> · {option.name}</span>
                                    </span>
                                    <span className="block truncate text-[9px] text-outline">
                                        {option.on_hand} on hand
                                        {option.delayed ? ` · ${option.promise}` : ""}
                                    </span>
                                </span>
                                {active ? (
                                    <span className="material-symbols-outlined shrink-0 text-[16px] text-success">
                                        check_circle
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}

                    {line.options.length === 0 ? (
                        <p className="text-[11px] text-on-surface-variant">
                            This store has no stock-bearing locations configured.
                        </p>
                    ) : null}
                </div>
            </div>

            {/* In hand: the picker ticks the line once they hold it. */}
            {chosenOption && !disabled ? (
                <button
                    type="button"
                    onClick={() => onPicked(!picked)}
                    className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[999px] py-2.5 text-xs font-bold transition-colors ${
                        picked ? "bg-success text-on-success" : "border-2 border-primary text-primary"
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">{picked ? "check_circle" : "back_hand"}</span>
                    {picked
                        ? `Picked ${line.quantity} from ${chosenOption.level_label}`
                        : `I have ${line.quantity} from ${chosenOption.level_label}`}
                </button>
            ) : null}
        </div>
    );
}

PickPack.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
