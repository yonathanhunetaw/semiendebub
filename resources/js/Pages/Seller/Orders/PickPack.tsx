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
 */

interface Props {
    reference?: string;
    /** Null when no order matches the reference — see the empty state below. */
    plan?: PickPackPlan | null;
}

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

export default function PickPack({ reference, plan = null }: Props): React.ReactElement {
    /** The location chosen per line, seeded from what the server suggests. */
    const [choices, setChoices] = useState<Record<number, SourceRef | null>>(() => {
        const seed: Record<number, SourceRef | null> = {};
        plan?.lines.forEach((line) => {
            seed[line.id] = line.confirmed_source ?? line.suggested_source ?? null;
        });
        return seed;
    });

    const [submitting, setSubmitting] = useState(false);

    const stats = useMemo(() => {
        const lines = plan?.lines ?? [];
        const chosen = lines.filter((line) => choices[line.id] != null).length;

        return {
            total: lines.length,
            chosen,
            // A line with nowhere holding enough cannot be sourced at all yet.
            unservable: lines.filter((line) => !line.options.some((option) => option.sufficient)).length,
        };
    }, [plan, choices]);

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
                        href={route("seller.orders.queue")}
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
    const alreadyConfirmed = sale.sourcing_confirmed_at !== null;

    const choose = (lineId: number, option: SourcingOption) =>
        setChoices((current) => ({ ...current, [lineId]: optionRef(option) }));

    const confirm = () => {
        if (!allChosen) return;

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
                                        : router.visit(route("seller.orders.queue"))
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

                    <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex flex-1 items-center gap-1.5">
                            <span
                                className={`material-symbols-outlined text-[15px] ${
                                    allChosen ? "text-success" : "text-outline"
                                }`}
                            >
                                where_to_vote
                            </span>
                            <span className="text-[11px] font-semibold text-on-surface-variant">Sourced</span>
                            <span className="ml-auto font-mono text-[11px] font-bold text-on-surface">
                                {stats.chosen}/{stats.total}
                            </span>
                        </div>
                    </div>
                </header>

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
                            disabled={alreadyConfirmed}
                            onChoose={(option) => choose(line.id, option)}
                        />
                    ))}
                </div>
            </div>

            {/* ── Sticky CTA ── */}
            <nav
                className="fixed inset-x-0 z-50 mx-auto max-w-[480px] rounded-t-[16px] border-t border-outline-variant bg-surface-container-lowest px-4 py-2.5 shadow-[0_-4px_16px_rgb(var(--on-surface)/0.08)] dark:shadow-none"
                style={{ bottom: ABOVE_NAV }}
            >
                <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div>
                        <span className="block font-mono text-[11px] text-on-surface-variant">
                            {stats.chosen}/{stats.total} sourced
                        </span>
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                            {alreadyConfirmed
                                ? "Already confirmed"
                                : allChosen
                                  ? "Ready to confirm"
                                  : "Pick a location for every line"}
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={!allChosen || submitting || alreadyConfirmed}
                        onClick={confirm}
                        className="max-w-[220px] flex-1 rounded-[999px] px-6 py-3 text-center text-sm font-bold text-on-primary shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 bg-primary"
                    >
                        {submitting ? "Confirming…" : "Confirm & move to delivery"}
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
}

/**
 * One line, with every location that holds it.
 *
 * A location that cannot cover the whole line is shown but not selectable: the
 * server refuses it anyway, and offering it would turn a clear rule into a
 * failed submit.
 */
function LineCard({ line, chosen, disabled, onChoose }: LineCardProps): React.ReactElement {
    const settled = chosen !== null;

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
                    <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        {line.variant_label} · ×{line.quantity}
                    </p>
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
        </div>
    );
}

PickPack.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
