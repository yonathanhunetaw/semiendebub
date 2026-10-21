import React from "react";
import { Link, router, useForm } from "@inertiajs/react";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, SkStats, inputClass, plural, when } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import type { PackType, PriceCheck, PriceObservation, PriceState, PriceSummary } from "@/types/procurement";

/**
 * One price check, on the seller and admin apps (Pages/{Seller,Admin}/PriceChecks/Show):
 * the shops to visit, the form to write a price down, the prices written so
 * far and (for whoever may) verifying them. Sellers get only the prices they
 * wrote themselves; the summary of verified prices is for everyone else.
 */

export const PRICE_STATE: Record<PriceState, { label: string; tone: Tone }> = {
    pending: { label: "To check", tone: "warning" },
    verified: { label: "Verified", tone: "success" },
    rejected: { label: "Rejected", tone: "error" },
};

const PACK_LABEL: Record<PackType, string> = { piece: "Piece", packet: "Packet", carton: "Carton" };

/** "Carton of 24 · from 2" */
export function packText(o: Pick<PriceObservation, "pack_type" | "pieces_per_pack" | "min_qty">): string {
    const pack = o.pack_type === "piece" ? "Piece" : `${PACK_LABEL[o.pack_type]} of ${o.pieces_per_pack}`;
    return o.min_qty > 1 ? `${pack} · from ${o.min_qty}` : pack;
}

export function SummaryCard({ summary, target }: { summary: PriceSummary; target: number | null }) {
    return (
        <SkCard>
            <SkCardHeader icon="query_stats" title="Verified prices, per piece" right={<span className="text-[12px] text-on-surface-variant">{summary.prices} {plural("price", summary.prices)}</span>} />
            <div className="p-4">
                <SkStats
                    cols={4}
                    items={[
                        { label: "Shops", value: summary.shops },
                        { label: "Lowest", value: money(summary.lowest) },
                        { label: "Median", value: money(summary.median) },
                        { label: "We would sell for", value: money(target), tone: target !== null && summary.median !== null && target > summary.median ? "warning" : undefined },
                    ]}
                />
                {summary.tiers.length > 1 ? (
                    <table className="mt-4 w-full text-[13px]">
                        <thead>
                            <tr className="text-left text-on-surface-variant">
                                <th className="py-1 font-semibold">Buying from</th>
                                <th className="py-1 font-semibold">Prices</th>
                                <th className="py-1 font-semibold">Lowest</th>
                                <th className="py-1 font-semibold">Median</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.tiers.map((t) => (
                                <tr key={t.from_pieces} className="border-t border-outline-variant/60">
                                    <td className="py-1.5">
                                        {t.from_pieces} {plural("piece", t.from_pieces)}
                                    </td>
                                    <td className="py-1.5">{t.prices}</td>
                                    <td className="py-1.5">{money(t.lowest)}</td>
                                    <td className="py-1.5">{money(t.median)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : null}
            </div>
        </SkCard>
    );
}

export default function PriceCheckPanel({ check, routePrefix, today }: { check: PriceCheck; routePrefix: string; today: string }) {
    const [closing, setClosing] = React.useState(false);

    return (
        <div className="space-y-4">
            <SkCard>
                <div className="space-y-2 p-4 text-[14px]">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={check.status === "open" ? "Open" : "Closed"} tone={check.status === "open" ? "info" : "neutral"} size="sm" />
                        <span className="text-on-surface-variant">{check.store.name}</span>
                        {check.due_on ? <span className="text-on-surface-variant">· due {when(check.due_on)}</span> : null}
                    </div>
                    {check.spec ? <p className="whitespace-pre-line">{check.spec}</p> : null}
                    {check.note ? <p className="whitespace-pre-line text-on-surface-variant">{check.note}</p> : null}
                    <p>
                        <span className="text-on-surface-variant">Shops so far: </span>
                        <span className="font-bold">
                            {check.shops_done} of {check.shops_wanted}
                        </span>
                        {check.target_price !== null ? (
                            <>
                                <span className="text-on-surface-variant"> · we would sell one for </span>
                                <span className="font-bold">{money(check.target_price)}</span>
                            </>
                        ) : null}
                    </p>
                    {check.assignees.length > 0 ? <p className="text-[13px] text-on-surface-variant">Checked by {check.assignees.join(", ")}</p> : null}
                </div>
                {check.can_manage && check.status === "open" ? (
                    <div className="flex justify-end border-t border-outline-variant/60 px-4 py-3">
                        <SkButton
                            variant="outline"
                            icon="lock"
                            disabled={closing}
                            onClick={() => {
                                setClosing(true);
                                router.post(route(`${routePrefix}.close`, check.id), {}, { preserveScroll: true, onFinish: () => setClosing(false) });
                            }}
                        >
                            Close the check
                        </SkButton>
                    </div>
                ) : null}
            </SkCard>

            {check.summary ? <SummaryCard summary={check.summary} target={check.target_price} /> : null}

            <SkCard>
                <SkCardHeader icon="storefront" title="Shops to check" />
                {check.shops.length === 0 ? (
                    <p className="p-4 text-[13px] text-on-surface-variant">This store has no shops on its list yet. An admin adds them under Shops.</p>
                ) : (
                    <ul className="flex flex-wrap gap-2 p-4">
                        {check.shops.map((s) => (
                            <li
                                key={s.id}
                                className={`flex items-center gap-1 rounded-[999px] border px-3 py-1 text-[13px] ${
                                    s.done ? "border-success/40 bg-success-container/50 text-on-success-container" : "border-outline-variant text-on-surface"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">{s.done ? "check_circle" : "radio_button_unchecked"}</span>
                                {s.name}
                                {s.area ? <span className="text-on-surface-variant">· {s.area}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}
            </SkCard>

            {check.can_record && check.shops.length > 0 ? <RecordForm check={check} routePrefix={routePrefix} today={today} /> : null}

            <SkCard>
                <SkCardHeader icon="sell" title={check.summary ? "Prices written down" : "Prices you wrote down"} />
                {check.observations.length === 0 ? (
                    <div className="p-4">
                        <EmptyState icon="sell" title="No prices yet" description="Visit a shop on the list and write down what it charges." />
                    </div>
                ) : (
                    <ul>
                        {check.observations.map((o) => (
                            <ObservationRow key={o.id} o={o} routePrefix={routePrefix} />
                        ))}
                    </ul>
                )}
            </SkCard>
        </div>
    );
}

function RecordForm({ check, routePrefix, today }: { check: PriceCheck; routePrefix: string; today: string }) {
    const form = useForm<{ shop_id: string; observed_on: string; pack_type: PackType; pieces_per_pack: string; min_qty: string; price: string; note: string }>({
        shop_id: String(check.shops.find((s) => !s.done)?.id ?? check.shops[0]?.id ?? ""),
        observed_on: today,
        pack_type: "piece",
        pieces_per_pack: "",
        min_qty: "1",
        price: "",
        note: "",
    });

    const perPack = form.data.pack_type === "piece" ? 1 : Number(form.data.pieces_per_pack) || 0;
    const perPiece = perPack > 0 && Number(form.data.price) > 0 ? Number(form.data.price) / perPack : null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route(`${routePrefix}.record`, check.id), {
            preserveScroll: true,
            onSuccess: () => form.reset("price", "note", "pieces_per_pack", "min_qty"),
        });
    };

    return (
        <SkCard>
            <SkCardHeader icon="edit_note" title="Write a price down" />
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <SkField label="Shop" error={form.errors.shop_id}>
                    <select className={inputClass} value={form.data.shop_id} onChange={(e) => form.setData("shop_id", e.target.value)}>
                        {check.shops.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                                {s.done ? " ✓" : ""}
                            </option>
                        ))}
                    </select>
                </SkField>
                <SkField label="Day you saw it" error={form.errors.observed_on}>
                    <input className={inputClass} type="date" max={today} value={form.data.observed_on} onChange={(e) => form.setData("observed_on", e.target.value)} />
                </SkField>
                <SkField label="Sold by the" error={form.errors.pack_type}>
                    <div className="flex gap-2">
                        {(["piece", "packet", "carton"] as PackType[]).map((p) => (
                            <button
                                key={p}
                                type="button"
                                aria-pressed={form.data.pack_type === p}
                                onClick={() => form.setData("pack_type", p)}
                                className={`flex-1 rounded-[12px] border px-3 py-2.5 text-[14px] font-semibold ${
                                    form.data.pack_type === p ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface"
                                }`}
                            >
                                {PACK_LABEL[p]}
                            </button>
                        ))}
                    </div>
                </SkField>
                {form.data.pack_type !== "piece" ? (
                    <SkField label={`Pieces in one ${form.data.pack_type}`} error={form.errors.pieces_per_pack}>
                        <input className={inputClass} type="number" min={1} inputMode="numeric" value={form.data.pieces_per_pack} onChange={(e) => form.setData("pieces_per_pack", e.target.value)} />
                    </SkField>
                ) : null}
                <SkField label={`Price holds from how many ${form.data.pack_type}s`} hint="1 for any amount; 10, 50, 100… for a bulk price." error={form.errors.min_qty}>
                    <input className={inputClass} type="number" min={1} inputMode="numeric" value={form.data.min_qty} onChange={(e) => form.setData("min_qty", e.target.value)} />
                </SkField>
                <SkField label={`Price for one ${form.data.pack_type} (ETB)`} hint={perPiece !== null && perPack > 1 ? `${money(perPiece)} a piece` : undefined} error={form.errors.price}>
                    <input className={inputClass} type="number" min={0} step="0.01" inputMode="decimal" value={form.data.price} onChange={(e) => form.setData("price", e.target.value)} />
                </SkField>
                <div className="sm:col-span-2">
                    <SkField label="Note" hint="Brand or model if it was not exactly the same, a discount they offered…" error={form.errors.note}>
                        <input className={inputClass} value={form.data.note} onChange={(e) => form.setData("note", e.target.value)} />
                    </SkField>
                </div>
                <div className="flex justify-end sm:col-span-2">
                    <SkButton type="submit" icon="add" disabled={form.processing || form.data.price === ""}>
                        Write it down
                    </SkButton>
                </div>
            </form>
        </SkCard>
    );
}

function ObservationRow({ o, routePrefix }: { o: PriceObservation; routePrefix: string }) {
    const [rejecting, setRejecting] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const state = PRICE_STATE[o.state];

    const post = (name: "verify" | "reject", payload: Record<string, string> = {}) => {
        setBusy(true);
        router.post(route(`${routePrefix}.${name}`, o.id), payload, {
            preserveScroll: true,
            onSuccess: () => setRejecting(false),
            onFinish: () => setBusy(false),
        });
    };

    return (
        <li className="border-b border-outline-variant/60 px-4 py-3 last:border-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[14px] font-bold text-on-surface">
                        {o.shop} <span className="font-normal text-on-surface-variant">· {packText(o)}</span>
                    </p>
                    <p className="text-[12px] text-on-surface-variant">
                        {o.recorded_by}
                        {o.observed_on ? ` · ${when(o.observed_on)}` : ""}
                    </p>
                    {o.note ? <p className="mt-1 text-[13px] text-on-surface-variant">{o.note}</p> : null}
                    {o.reject_reason ? <p className="mt-1 text-[13px] italic text-error">{o.reject_reason}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[15px] font-bold text-on-surface">{money(o.price)}</p>
                    {o.pieces_per_pack > 1 ? <p className="text-[12px] text-on-surface-variant">{money(o.price_per_piece)} a piece</p> : null}
                    <StatusPill label={state.label} tone={state.tone} size="xs" className="mt-1 inline-block" />
                </div>
            </div>
            {o.can_verify ? (
                rejecting ? (
                    <div className="mt-2 flex gap-2">
                        <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it wrong?" autoFocus />
                        <SkButton variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => post("reject", { reason })}>
                            Reject
                        </SkButton>
                        <SkButton variant="ghost" onClick={() => setRejecting(false)}>
                            Cancel
                        </SkButton>
                    </div>
                ) : (
                    <div className="mt-2 flex justify-end gap-2">
                        <SkButton variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
                            Wrong
                        </SkButton>
                        <SkButton variant="success" icon="check" disabled={busy} onClick={() => post("verify")}>
                            Verify
                        </SkButton>
                    </div>
                )
            ) : null}
        </li>
    );
}

/** The cards of the price check lists (Pages/{Seller,Admin}/PriceChecks/Index). */
export function PriceCheckCards({ checks, routePrefix }: { checks: PriceCheck[]; routePrefix: string }) {
    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {checks.map((c) => {
                const pending = c.observations.filter((o) => o.state === "pending").length;
                const pct = Math.min(100, Math.round((c.shops_done / Math.max(1, c.shops_wanted)) * 100));

                return (
                    <Link key={c.id} href={route(`${routePrefix}.show`, c.id)} className="block rounded-[16px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm hover:border-primary">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-[15px] font-bold text-on-surface">{c.subject}</p>
                                <p className="text-[12px] text-on-surface-variant">
                                    {c.store.name}
                                    {c.due_on ? ` · due ${when(c.due_on)}` : ""}
                                    {c.item_id ? " · item we sell" : ""}
                                </p>
                            </div>
                            {pending > 0 && c.observations.some((o) => o.can_verify) ? <StatusPill label={`${pending} to check`} tone="warning" size="xs" /> : null}
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-[999px] bg-surface-container">
                            <div className="h-full rounded-[999px] bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1.5 text-[12px] text-on-surface-variant">
                            {c.shops_done} of {c.shops_wanted} {plural("shop", c.shops_wanted)}
                        </p>
                    </Link>
                );
            })}
        </div>
    );
}
