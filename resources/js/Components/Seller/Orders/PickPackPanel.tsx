import { birr } from "@/Data/sellerOrderFlow";
import type { PickPackLine, PickPackPlan, SourceRef, SourcingOption } from "@/types/sourcing";
import { Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Pick & pack for one paid order, inside its card on My Orders.
 *
 * A paid order knows what was sold and which store sold it, not where the
 * goods are: a store holds stock on its shelf, its floor, at its Remote Hub.
 * So each line names the exact place it is picked from, chosen from the places
 * that hold it (OrderSourcingService::pickPackPlan; nothing about availability
 * is worked out in the browser). Then: tick each line once in hand, tick the
 * parcel packed, hand it to delivery (or to the customer, in store). Ticks and
 * "packed" are saved on the order (PickProgressController), so a stock keeper
 * can carry on where a seller stopped and the courier sees it coming.
 *
 * An order in To pay cannot be picked at all. One whose payment changed in
 * Pick & pack can be picked but not handed over until the money is confirmed.
 */

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

const optionRef = (option: SourcingOption): SourceRef => ({ location_type: option.location_type, location_id: option.location_id });

export default function PickPackPanel({ plan }: { plan: PickPackPlan }): React.ReactElement {
    const { sale, lines } = plan;

    /** The place chosen per line, seeded from what the server suggests. */
    const [choices, setChoices] = useState<Record<number, SourceRef | null>>(() =>
        Object.fromEntries(lines.map((line) => [line.id, line.confirmed_source ?? line.suggested_source ?? null])),
    );
    const [submitting, setSubmitting] = useState(false);
    const [picked, setPickedMap] = useState<Record<number, boolean>>(() => Object.fromEntries(lines.map((line) => [line.id, line.is_sourced || Boolean(line.ticked_at)])));
    const [packed, setPackedState] = useState(() => Boolean(sale.packed_at));

    // Saved without reloading the board, so the places chosen here stay.
    const save = (url: string, done: boolean) => router.post(url, { done }, { preserveScroll: true, preserveState: true });

    const setPicked = (lineId: number, value: boolean) => {
        setPickedMap((current) => ({ ...current, [lineId]: value }));
        setPackedState(false);
        save(route("seller.orders.lines.tick", { sale: sale.id, item: lineId }), value);
    };
    const setPacked = (value: boolean) => {
        setPackedState(value);
        save(route("seller.orders.packed", { sale: sale.id }), value);
    };

    const stats = useMemo(() => {
        const chosen = lines.filter((line) => choices[line.id] != null).length;
        return {
            total: lines.length,
            chosen,
            picked: lines.filter((line) => choices[line.id] != null && picked[line.id]).length,
            units: lines.reduce((sum, line) => sum + line.quantity, 0),
            // A line with nowhere holding enough cannot be sourced at all yet.
            unservable: lines.filter((line) => !line.options.some((option) => option.sufficient)).length,
        };
    }, [lines, choices, picked]);

    const allChosen = stats.total > 0 && stats.chosen === stats.total;
    const allPicked = allChosen && stats.picked === stats.total;
    const alreadyConfirmed = sale.sourcing_confirmed_at !== null;
    // Money first: an order whose payment is not confirmed by two people
    // never reaches the shelf (the server refuses it too).
    const awaitingPayment = sale.fulfillment_stage === "awaiting_payment";
    const unpaid = !awaitingPayment && sale.paid === false;
    const locked = alreadyConfirmed || awaitingPayment;
    const ready = allPicked && packed && !locked && !unpaid;
    const step = alreadyConfirmed ? 4 : awaitingPayment ? 0 : !allChosen ? 1 : !allPicked ? 2 : 3;
    const startedAt = sale.picking_started_at ? new Date(sale.picking_started_at) : null;
    // In store: the customer takes it at the counter.
    const inStore = plan.delivery?.method === "store";

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

    const hint = alreadyConfirmed
        ? inStore ? "Handed to the customer" : "Already with delivery"
        : awaitingPayment
          ? "Waiting for payment"
          : unpaid && allPicked && packed
            ? "Packed · waiting for payment"
            : !allChosen
              ? "Choose a place for every line"
              : !allPicked
                ? "Tick each line once in hand"
                : !packed
                  ? "Tick packed and labelled"
                  : "Ready to hand over";

    return (
        <div className="space-y-2.5 rounded-[14px] border border-primary/30 bg-surface-container-low p-3">
            {/* Where this order is in the walk. */}
            <ol className="flex items-center">
                {STEPS.map((entry, index) => {
                    const done = (index < step || (index === step && alreadyConfirmed)) && !(index === 0 && unpaid);
                    const current = index === step && !alreadyConfirmed;
                    return (
                        <li key={entry.id} className="flex flex-1 items-center last:flex-none">
                            <span className="flex flex-col items-center">
                                <span
                                    className={`flex h-7 w-7 items-center justify-center rounded-[999px] border-2 ${
                                        done ? "border-success bg-success text-on-success" : current ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-outline"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[15px]">{done ? "check" : entry.icon}</span>
                                </span>
                                <span className={`mt-0.5 text-[9px] font-bold ${current ? "text-primary" : "text-on-surface-variant"}`}>{entry.label}</span>
                            </span>
                            {index < STEPS.length - 1 ? <span className={`mx-1 mb-4 h-0.5 flex-1 rounded ${index < step ? "bg-success" : "bg-outline-variant"}`} /> : null}
                        </li>
                    );
                })}
            </ol>

            {!locked ? (
                <div className="rounded-[12px] bg-primary p-3 text-on-primary">
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                        Step {step + 1} of {STEPS.length}
                    </p>
                    <p className="text-[14px] font-extrabold leading-snug">
                        {step === 1 ? `Choose where each of ${stats.total} line(s) comes from` : step === 2 ? `Collect the items: ${stats.picked}/${stats.total} in hand` : "Pack it and hand it over"}
                    </p>
                    <p className="text-[11px] opacity-85">
                        {stats.units} item(s) · {birr(sale.total_amount)}
                    </p>
                    {step === 1 && lines.some((line) => line.suggested_source && !choices[line.id]) ? (
                        <button type="button" onClick={fillSuggested} className="mt-2 inline-flex items-center gap-1 rounded-[999px] bg-on-primary px-3 py-1.5 text-[11px] font-bold text-primary">
                            <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
                            Use the nearest place for every line
                        </button>
                    ) : null}
                </div>
            ) : null}

            {awaitingPayment ? (
                <Notice tone="error" icon="lock" title="Not paid yet: don't pick this order.">
                    Every payment part has to be confirmed by a second person before it can be picked.{" "}
                    <Link href={route("seller.orders.pay", sale.reference)} className="font-bold underline">
                        Open its payment
                    </Link>
                </Notice>
            ) : null}
            {unpaid ? (
                <Notice tone="warning" icon="payments" title="Payment changed: not fully paid.">
                    Keep picking, but it can't go to delivery until every part is confirmed.{" "}
                    <Link href={route("seller.orders.pay", sale.reference)} className="font-bold underline">
                        Open its payment
                    </Link>
                </Notice>
            ) : null}

            {!locked ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 py-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-on-surface-variant">
                        <span className="material-symbols-outlined text-[15px]">{startedAt ? "person_play" : "hourglass_empty"}</span>
                        <span className="truncate">
                            {startedAt
                                ? `Picking since ${startedAt.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${sale.picking_started_by ? ` · ${sale.picking_started_by}` : ""}`
                                : "Nobody has started picking yet"}
                        </span>
                    </span>
                    <span className="flex items-center gap-2">
                        {!startedAt ? (
                            <button type="button" onClick={() => router.post(route("seller.orders.picking.start", sale.id), {}, { preserveScroll: true, preserveState: true })} className="rounded-[999px] bg-primary px-3 py-1 text-[11px] font-bold text-on-primary">
                                Start picking
                            </button>
                        ) : null}
                        <Link href={route("seller.orders.pay", sale.reference)} className="rounded-[999px] border border-outline/50 px-3 py-1 text-[11px] font-semibold text-on-surface">
                            Change payment
                        </Link>
                    </span>
                </div>
            ) : null}

            {plan.delivery !== undefined && !alreadyConfirmed ? (
                <div className="flex items-start gap-2 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[11px] text-on-surface-variant">
                    <span className="material-symbols-outlined mt-0.5 shrink-0 text-[15px]">{inStore ? "storefront" : plan.delivery?.method === "vehicle" ? "local_shipping" : "home_pin"}</span>
                    <div className="min-w-0 flex-1">
                        {inStore ? (
                            <p>
                                <strong className="text-on-surface">In store</strong> · the customer takes it here
                            </p>
                        ) : plan.delivery === null || (plan.delivery.method === "courier" && !plan.delivery.address) ? (
                            <p className="font-semibold text-on-warning-container">No delivery details yet. Add them before handing it over.</p>
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
                <Notice tone="success" icon="check_circle" title={inStore ? "Picked and handed to the customer in the store." : "Sourcing confirmed; this order moved on to delivery."} />
            ) : null}
            {sale.delay_agreed ? <Notice tone="warning" icon="schedule" title="The buyer agreed to a longer wait for warehouse-sourced items." /> : null}
            {stats.unservable > 0 ? (
                <Notice tone="error" icon="error" title={`${stats.unservable} line(s) have no single place holding the full quantity.`}>
                    Replenish first, or split the order.
                </Notice>
            ) : null}

            <div className="space-y-2.5">
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

            {!locked ? (
                <label className={`flex cursor-pointer items-center gap-3 rounded-[14px] border p-3 ${!allPicked ? "opacity-50" : packed ? "border-success/50 bg-success-container/40" : "border-primary bg-surface-container-lowest"}`}>
                    <input type="checkbox" checked={packed} disabled={!allPicked} onChange={(e) => setPacked(e.target.checked)} className="h-5 w-5 rounded accent-[rgb(var(--primary))]" />
                    <span>
                        <span className="block text-[13px] font-bold text-on-surface">Packed and labelled</span>
                        <span className="block text-[11px] text-on-surface-variant">Every line is in the parcel with {sale.reference} on it.</span>
                    </span>
                </label>
            ) : null}

            {!alreadyConfirmed ? (
                <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="min-w-0">
                        <span className="block font-mono text-[11px] text-on-surface-variant">
                            {stats.picked}/{stats.total} picked
                        </span>
                        <span className="text-[11px] font-semibold text-on-surface-variant">{hint}</span>
                    </div>
                    <button
                        type="button"
                        disabled={!ready || submitting}
                        onClick={confirm}
                        className="shrink-0 rounded-[999px] bg-primary px-5 py-2.5 text-[13px] font-bold text-on-primary shadow-md transition-transform active:scale-[0.98] disabled:opacity-40"
                    >
                        {submitting ? "Handing over…" : `Hand to ${inStore ? "customer" : "delivery"}`}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function Notice({ tone, icon, title, children }: { tone: "error" | "warning" | "success"; icon: string; title: string; children?: React.ReactNode }) {
    const look = {
        error: "border-error/30 bg-error-container/60 text-on-error-container",
        warning: "border-warning/40 bg-warning-container/60 text-on-warning-container",
        success: "border-success/30 bg-success-container/60 text-on-success-container",
    }[tone];

    return (
        <div className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 ${look}`}>
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px]">{icon}</span>
            <div className="text-[11px] leading-snug">
                <p className="font-bold">{title}</p>
                {children ? <p>{children}</p> : null}
            </div>
        </div>
    );
}

/**
 * One line, with every place that holds it. A place that can't cover the
 * whole line is shown but not selectable: the server refuses it anyway.
 */
function LineCard({ line, chosen, disabled, onChoose, picked, onPicked }: { line: PickPackLine; chosen: SourceRef | null; disabled: boolean; onChoose: (option: SourcingOption) => void; picked: boolean; onPicked: (picked: boolean) => void }) {
    const settled = chosen !== null && picked;
    const chosenOption = line.options.find((option) => sameSource(chosen, optionRef(option))) ?? null;

    return (
        <div className={`rounded-[14px] border bg-surface-container-lowest p-3 shadow-sm ${settled ? "border-success/40" : "border-outline-variant/60"}`}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-bold leading-snug text-on-surface">{line.title}</p>
                    <span className="mt-1 inline-flex max-w-full items-center gap-0.5 rounded-[6px] border border-primary/30 bg-primary-container/40 px-1.5 py-0.5 text-[11px] font-semibold text-on-surface">
                        <span className="material-symbols-outlined text-[13px] text-primary">sell</span>
                        <span className="truncate">{line.variant_label}</span>
                    </span>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[15px] font-extrabold text-on-surface">×{line.quantity}</p>
                    <p className="font-mono text-[11px] text-outline">{birr(line.line_total)}</p>
                </div>
            </div>

            <p className="mb-1.5 mt-2.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Pick from</p>
            <div className="space-y-1.5">
                {line.options.map((option) => {
                    const active = sameSource(chosen, optionRef(option));
                    const selectable = option.sufficient && !disabled;
                    return (
                        <button
                            key={`${option.location_type}#${option.location_id}`}
                            type="button"
                            disabled={!selectable}
                            title={option.sufficient ? undefined : `Only ${option.on_hand} here, not enough for this line`}
                            onClick={() => onChoose(option)}
                            className={`flex w-full items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                                active ? "border-primary bg-primary-container/35" : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                            } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                            <span className={`material-symbols-outlined text-[18px] ${active ? "text-primary" : "text-outline"}`}>{LEVEL_ICONS[option.kind] ?? LEVEL_ICONS.other}</span>
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate text-[11px] font-bold ${active ? "text-on-surface" : "text-on-surface-variant"}`}>
                                    {option.level_label}
                                    <span className="font-medium text-outline"> · {option.name}</span>
                                </span>
                                <span className="block truncate text-[9px] text-outline">
                                    {option.on_hand} on hand
                                    {option.delayed ? ` · ${option.promise}` : ""}
                                </span>
                            </span>
                            {active ? <span className="material-symbols-outlined shrink-0 text-[16px] text-success">check_circle</span> : null}
                        </button>
                    );
                })}
                {line.options.length === 0 ? <p className="text-[11px] text-on-surface-variant">This store has no stock-bearing places set up.</p> : null}
            </div>

            {chosenOption && !disabled ? (
                <button
                    type="button"
                    onClick={() => onPicked(!picked)}
                    className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[999px] py-2.5 text-xs font-bold transition-colors ${picked ? "bg-success text-on-success" : "border-2 border-primary text-primary"}`}
                >
                    <span className="material-symbols-outlined text-[17px]">{picked ? "check_circle" : "back_hand"}</span>
                    {picked ? `Picked ${line.quantity} from ${chosenOption.level_label}` : `I have ${line.quantity} from ${chosenOption.level_label}`}
                </button>
            ) : null}
        </div>
    );
}
