import React from "react";
import { Link, router, useForm } from "@inertiajs/react";
import { EmptyState, StatusPill, type Tone } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkChips, SkField, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import CheckDetailsFields, { EMPTY_CHECK, type CheckDetails } from "@/Components/Procurement/CheckDetailsFields";
import type { ProductIdea, ProductIdeaBoardProps, ProductIdeaMove, ProductIdeaStatus } from "@/types/procurement";

/**
 * Product ideas: the same board on the seller, admin and procurement apps
 * (Pages/{Seller,Admin,Procurement}/Ideas/Index). Each page brings its own
 * header; the board brings the tabs, the cards, the suggest form and the
 * sheet a move opens when it needs a reason or a price. The server decides
 * which moves each person sees (ProductIdeaService).
 */

export const IDEA_STATUS: Record<ProductIdeaStatus, { label: string; tone: Tone }> = {
    suggested: { label: "Suggested", tone: "neutral" },
    scouting: { label: "Price check", tone: "info" },
    scouted: { label: "Prices in", tone: "primary" },
    sourcing: { label: "With procurement", tone: "warning" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "error" },
    bought: { label: "Bought", tone: "success" },
};

const OPEN: ProductIdeaStatus[] = ["suggested", "scouting", "scouted", "sourcing", "approved"];

const TABS: Array<{ value: string; label: string }> = [
    { value: "open", label: "Open" },
    { value: "suggested", label: "Suggested" },
    { value: "scouting", label: "Price check" },
    { value: "scouted", label: "Prices in" },
    { value: "sourcing", label: "With procurement" },
    { value: "approved", label: "Approved" },
    { value: "bought", label: "Bought" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
];

interface Props extends ProductIdeaBoardProps {
    /** The page's header; `openSuggest` opens the suggest form. */
    header: (openSuggest: () => void) => React.ReactNode;
    suggestTitle?: string;
    /** May the person pick "Every store" in the suggest form? */
    allowEveryStore?: boolean;
}

export default function IdeaBoard({ ideas = [], counts = {}, tab, canSuggest, stores = [], routePrefix, staff = {}, checkRoutePrefix = null, quotesRoute = null, orderLines = [], header, suggestTitle = "Suggest a product", allowEveryStore = false }: Props) {
    const [suggesting, setSuggesting] = React.useState(false);
    const [moving, setMoving] = React.useState<{ idea: ProductIdea; move: ProductIdeaMove } | null>(null);
    const [busy, setBusy] = React.useState<number | null>(null);
    const [buying, setBuying] = React.useState<ProductIdea | null>(null);

    const tabCount = (value: string): number | undefined => {
        if (value === "all") return undefined;
        if (value === "open") return OPEN.reduce((sum, s) => sum + (counts[s] ?? 0), 0) || undefined;
        return counts[value as ProductIdeaStatus] || undefined;
    };

    const go = (next: string) =>
        router.get(route(`${routePrefix}.index`), next === "open" ? {} : { tab: next }, { preserveState: true, preserveScroll: true, replace: true });

    const run = (idea: ProductIdea, move: ProductIdeaMove) => {
        if (move.needs_note || move.opens_check || (move.asks_target_price && idea.target_price === null)) {
            setMoving({ idea, move });
            return;
        }
        setBusy(idea.id);
        router.post(route(`${routePrefix}.move`, idea.id), { to: move.to }, { preserveScroll: true, onFinish: () => setBusy(null) });
    };

    return (
        <>
            {header(() => setSuggesting(true))}

            <div className="mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <SkChips<string> value={tab} onChange={go} options={TABS.map((t) => ({ ...t, count: tabCount(t.value) }))} />
            </div>

            {ideas.length === 0 ? (
                <EmptyState
                    framed
                    icon="lightbulb"
                    title="No ideas here"
                    description={canSuggest ? "Seen something customers ask for that we do not sell? Suggest it." : "Ideas from the stores show up here."}
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {ideas.map((idea) => (
                        <IdeaCard key={idea.id} idea={idea} busy={busy === idea.id} checkRoutePrefix={checkRoutePrefix} quotesRoute={quotesRoute} onMove={(move) => run(idea, move)} onBought={orderLines.length > 0 ? () => setBuying(idea) : undefined} />
                    ))}
                </div>
            )}

            {canSuggest ? (
                <SuggestSheet
                    open={suggesting}
                    onClose={() => setSuggesting(false)}
                    title={suggestTitle}
                    stores={stores}
                    allowEveryStore={allowEveryStore}
                    action={route(`${routePrefix}.store`)}
                />
            ) : null}

            <BoughtSheet idea={buying} onClose={() => setBuying(null)} orderLines={orderLines} />
            <MoveSheet state={moving} onClose={() => setMoving(null)} routePrefix={routePrefix} stores={stores} staff={staff} />
        </>
    );
}

function IdeaCard({
    idea,
    busy,
    checkRoutePrefix,
    quotesRoute,
    onMove,
    onBought,
}: {
    idea: ProductIdea;
    busy: boolean;
    checkRoutePrefix: string | null;
    quotesRoute: string | null;
    onMove: (move: ProductIdeaMove) => void;
    onBought?: () => void;
}) {
    const showQuotes = quotesRoute !== null && idea.costs !== null && (idea.costs.quotes > 0 || ["sourcing", "approved", "bought"].includes(idea.status));
    const [history, setHistory] = React.useState(false);
    const status = IDEA_STATUS[idea.status];

    return (
        <SkCard className="flex flex-col">
            <div className="flex items-start justify-between gap-3 px-4 pt-4">
                <div className="min-w-0">
                    <p className="text-[16px] font-bold leading-snug text-on-surface">{idea.name}</p>
                    <p className="mt-0.5 text-[12px] text-on-surface-variant">
                        {idea.store ? idea.store.name : "Every store"}
                        {idea.suggested_by ? ` · ${idea.suggested_by}` : ""}
                        {idea.created_at ? ` · ${when(idea.created_at)}` : ""}
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill label={status.label} tone={status.tone} size="sm" />
                    {idea.source === "procurement" ? <StatusPill label="From procurement" tone="tertiary" size="xs" icon="shopping_bag" /> : null}
                </div>
            </div>

            <div className="flex-1 space-y-2 px-4 py-3 text-[14px] text-on-surface">
                {idea.spec ? <p className="whitespace-pre-line">{idea.spec}</p> : null}
                {idea.reason ? <p className="whitespace-pre-line text-on-surface-variant">“{idea.reason}”</p> : null}
                <p className="text-[13px]">
                    <span className="text-on-surface-variant">We would sell one for </span>
                    <span className="font-bold">{idea.target_price !== null ? money(idea.target_price) : "not set yet"}</span>
                </p>
                {idea.prices && idea.prices.prices > 0 ? (
                    <p className="rounded-[12px] bg-surface-container-low px-3 py-2 text-[13px]">
                        <span className="text-on-surface-variant">Other shops, per piece: </span>
                        <span className="font-bold">{money(idea.prices.lowest)}</span>
                        <span className="text-on-surface-variant"> lowest · </span>
                        <span className="font-bold">{money(idea.prices.median)}</span>
                        <span className="text-on-surface-variant">
                            {" "}
                            median · {idea.prices.shops} {idea.prices.shops === 1 ? "shop" : "shops"}
                        </span>
                    </p>
                ) : null}
                {showQuotes && quotesRoute ? (
                    <Link href={route(quotesRoute, idea.id)} className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                        <span className="material-symbols-outlined text-[16px]">request_quote</span>
                        {idea.costs && idea.costs.quotes > 0
                            ? `${idea.costs.quotes} ${idea.costs.quotes === 1 ? "quote" : "quotes"}${idea.costs.best_cost_per_piece !== null ? ` · from ${money(idea.costs.best_cost_per_piece)} a piece on the shelf` : ""}`
                            : "Quotes and cost"}
                    </Link>
                ) : null}
                {idea.checks.length > 0 ? (
                    <ul className="space-y-1">
                        {idea.checks.map((c) => {
                            const label = `Price check at ${c.store}: ${c.shops_done} of ${c.shops_wanted} shops${c.status === "closed" ? " (closed)" : ""}`;
                            return (
                                <li key={c.id} className="flex items-center gap-1.5 text-[13px]">
                                    <span className="material-symbols-outlined text-[16px] text-primary">price_check</span>
                                    {checkRoutePrefix ? (
                                        <Link href={route(`${checkRoutePrefix}.show`, c.id)} className="font-semibold text-primary">
                                            {label}
                                        </Link>
                                    ) : (
                                        <span>{label}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
            </div>

            {idea.events.length > 1 ? (
                <div className="px-4 pb-2">
                    <button type="button" onClick={() => setHistory((h) => !h)} className="text-[12px] font-semibold text-primary">
                        {history ? "Hide history" : `History (${idea.events.length})`}
                    </button>
                    {history ? (
                        <ol className="mt-2 space-y-1.5 border-l border-outline-variant pl-3">
                            {idea.events.map((e, i) => (
                                <li key={i} className="text-[12px] text-on-surface-variant">
                                    <span className="font-semibold text-on-surface">{IDEA_STATUS[e.to]?.label ?? e.to}</span>
                                    {e.by ? ` · ${e.by}` : ""}
                                    {e.at ? ` · ${when(e.at)}` : ""}
                                    {e.note ? <span className="block italic">{e.note}</span> : null}
                                </li>
                            ))}
                        </ol>
                    ) : null}
                </div>
            ) : null}

            {idea.moves.length > 0 || (idea.can_mark_bought && onBought) ? (
                <div className="flex flex-wrap gap-2 border-t border-outline-variant/60 px-4 py-3">
                    {idea.can_mark_bought && onBought ? (
                        <SkButton type="button" variant="success" icon="shopping_bag" disabled={busy} onClick={onBought}>
                            Bought on an order
                        </SkButton>
                    ) : null}
                    {idea.moves.map((move) => (
                        <SkButton
                            key={move.to}
                            type="button"
                            disabled={busy}
                            variant={move.to === "rejected" ? "danger" : move.to === "approved" ? "success" : "outline"}
                            onClick={() => onMove(move)}
                        >
                            {move.label}
                        </SkButton>
                    ))}
                </div>
            ) : null}
        </SkCard>
    );
}

function SuggestSheet({ open, onClose, title, stores, allowEveryStore, action }: { open: boolean; onClose: () => void; title: string; stores: Array<{ id: number; name: string }>; allowEveryStore: boolean; action: string }) {
    const form = useForm<{ name: string; spec: string; reason: string; target_price: string; store_id: string }>({
        name: "",
        spec: "",
        reason: "",
        target_price: "",
        store_id: allowEveryStore || stores.length === 0 ? "" : String(stores[0].id),
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(action, {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                onClose();
            },
        });
    };

    const pickStore = stores.length > 1 || (allowEveryStore && stores.length > 0);

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            title={title}
            subtitle="A product we do not sell yet. It goes to price check, then to procurement."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton type="submit" form="suggest-idea" icon="send" disabled={form.processing}>
                        Suggest
                    </SkButton>
                </div>
            }
        >
            <form id="suggest-idea" onSubmit={submit} className="space-y-4">
                <SkField label="What is it?" error={form.errors.name}>
                    <input className={inputClass} value={form.data.name} onChange={(e) => form.setData("name", e.target.value)} placeholder="SanDisk 64 GB flash drive" autoFocus />
                </SkField>
                <SkField label="Details" hint="Brand, size, colour, model: whatever tells procurement exactly which one." error={form.errors.spec}>
                    <textarea className={inputClass} rows={2} value={form.data.spec} onChange={(e) => form.setData("spec", e.target.value)} />
                </SkField>
                <SkField label="Why?" hint="Customers ask for it, a shop nearby sells a lot of it…" error={form.errors.reason}>
                    <textarea className={inputClass} rows={2} value={form.data.reason} onChange={(e) => form.setData("reason", e.target.value)} />
                </SkField>
                <SkField label="We would sell one for (ETB)" hint="Your best guess. It can be set later." error={form.errors.target_price}>
                    <input className={inputClass} type="number" min={0} step="0.01" inputMode="decimal" value={form.data.target_price} onChange={(e) => form.setData("target_price", e.target.value)} />
                </SkField>
                {pickStore ? (
                    <SkField label="For which store?" error={form.errors.store_id}>
                        <select className={inputClass} value={form.data.store_id} onChange={(e) => form.setData("store_id", e.target.value)}>
                            {allowEveryStore ? <option value="">Every store</option> : null}
                            {stores.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </SkField>
                ) : null}
            </form>
        </SkSheet>
    );
}

function MoveSheet({
    state,
    onClose,
    routePrefix,
    stores,
    staff,
}: {
    state: { idea: ProductIdea; move: ProductIdeaMove } | null;
    onClose: () => void;
    routePrefix: string;
    stores: Array<{ id: number; name: string }>;
    staff: Record<string, Array<{ id: number; name: string }>>;
}) {
    const [note, setNote] = React.useState("");
    const [price, setPrice] = React.useState("");
    const [storeId, setStoreId] = React.useState("");
    const [details, setDetails] = React.useState<CheckDetails>(EMPTY_CHECK);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        setNote("");
        setPrice(state?.idea.target_price !== null && state?.idea.target_price !== undefined ? String(state.idea.target_price) : "");
        setStoreId(state?.idea.store ? String(state.idea.store.id) : "");
        setDetails(EMPTY_CHECK);
    }, [state]);

    if (!state) return null;
    const { idea, move } = state;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        router.post(
            route(`${routePrefix}.move`, idea.id),
            {
                to: move.to,
                ...(move.needs_note ? { note } : {}),
                ...(move.asks_target_price && price !== "" ? { target_price: price } : {}),
                ...(move.opens_check
                    ? {
                          ...(move.needs_store ? { store_id: storeId } : {}),
                          shops_wanted: details.shops_wanted,
                          due_on: details.due_on || null,
                          assignee_ids: details.assignee_ids,
                          check_note: details.note || null,
                      }
                    : {}),
            },
            { preserveScroll: true, onSuccess: onClose, onFinish: () => setBusy(false) },
        );
    };

    return (
        <SkSheet
            open
            onClose={onClose}
            title={`${move.label}: ${idea.name}`}
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton type="submit" form="move-idea" variant={move.to === "rejected" ? "danger" : "primary"} disabled={busy || (move.needs_note && note.trim() === "") || (move.asks_target_price && price === "") || (move.needs_store && storeId === "")}>
                        {move.label}
                    </SkButton>
                </div>
            }
        >
            <form id="move-idea" onSubmit={submit} className="space-y-4">
                {move.asks_target_price ? (
                    <SkField label="We would sell one for (ETB)" hint="Sellers check other shops against this price.">
                        <input className={inputClass} type="number" min={0} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
                    </SkField>
                ) : null}
                {move.needs_store ? (
                    <SkField label="Which store's sellers check the prices?">
                        <select className={inputClass} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                            <option value="">Pick a store</option>
                            {stores.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </SkField>
                ) : null}
                {move.opens_check ? <CheckDetailsFields value={details} onChange={setDetails} staff={storeId ? (staff[storeId] ?? []) : []} /> : null}
                {move.needs_note ? (
                    <SkField label="Why?" hint="Whoever suggested it sees this.">
                        <textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                    </SkField>
                ) : null}
            </form>
        </SkSheet>
    );
}

function BoughtSheet({ idea, onClose, orderLines }: { idea: ProductIdea | null; onClose: () => void; orderLines: Array<{ id: number; label: string }> }) {
    const [lineId, setLineId] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => setLineId(orderLines[0] ? String(orderLines[0].id) : ""), [idea, orderLines]);

    if (!idea) return null;

    return (
        <SkSheet
            open
            onClose={onClose}
            title={`Bought: ${idea.name}`}
            subtitle="Pick the order line that buys it. The idea takes that line's item."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton
                        variant="success"
                        disabled={busy || lineId === ""}
                        onClick={() => {
                            setBusy(true);
                            router.post(route("procurement.ideas.bought", idea.id), { purchase_line_id: lineId }, { preserveScroll: true, onSuccess: onClose, onFinish: () => setBusy(false) });
                        }}
                    >
                        Mark bought
                    </SkButton>
                </div>
            }
        >
            <SkField label="Order line">
                <select className={inputClass} value={lineId} onChange={(e) => setLineId(e.target.value)}>
                    {orderLines.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.label}
                        </option>
                    ))}
                </select>
            </SkField>
        </SkSheet>
    );
}
