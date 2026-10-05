import SellerLayout from "@/Layouts/SellerLayout";
import { ABOVE_NAV } from "@/Data/sellerOrderFlow";
import { Head, Link, router } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Seller cart console.
 *
 * The highest-priority cart is opened in full; every other cart sits in the
 * "Other carts" panel behind the bag icon, where it can be reordered. Promoting
 * a cart there makes it the one on screen, and the new order is persisted
 * through the existing `carts.reorder` endpoint.
 *
 * Lines are banded by fulfillment — stock in the seller's own store versus
 * stock consolidated through the hub — which is the `fulfillment` flag the
 * controller derives from `cart_items.store_id`.
 *
 * Radii are explicit: tailwind.config.js redefines `rounded-full` to 0.75rem.
 */


interface CartLine {
    id: number;
    sku: string | null;
    name: string;
    variant_label: string | null;
    image: string;
    quantity: number;
    price: number;
    extra_pieces: number;
    line_total: number;
    store_id: number;
    fulfillment: "local" | "hub";
}

interface CartSummary {
    id: number;
    status: string | null;
    priority: number | null;
    customer: { name: string | null; type: string | null } | null;
    seller: { name: string | null } | null;
    line_count: number;
    total: number;
    lines: CartLine[];
}

interface Props {
    carts: CartSummary[];
    home_store?: string | null;
}

const FULFILLMENT = {
    local: {
        title: "Store & Remote Hub",
        badge: "Local + Remote",
        badgeClass: "bg-info text-on-info",
        tags: ["Express Ready", "Direct Dispatch"],
    },
    hub: {
        title: "Warehouse",
        badge: "Hub Consolidation",
        badgeClass: "bg-warning-container text-on-warning-container",
        tags: ["Consolidated", "Scheduled Run"],
    },
} as const;

const birr = (amount: number) =>
    `ETB ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cartLabel = (cart: CartSummary) =>
    cart.customer?.name ? `${cart.customer.name}'s cart` : `Cart #${cart.id}`;

/** Circular select control from the reference design. */
function SelectDot({ checked, onClick, className = "" }: {
    checked: boolean;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            role="checkbox"
            aria-checked={checked}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[999px] border transition-colors ${
                checked ? "border-primary text-on-primary" : "border-outline/50 bg-surface-container-lowest"
            } ${className} ${checked ? "bg-primary" : ""}`}
        >
            {checked ? <span className="material-symbols-outlined text-[13px]">check</span> : null}
        </button>
    );
}

export default function CartsIndex({ carts = [], home_store }: Props): React.ReactElement {
    // Local ordering so promoting a cart is instant; the server is told after.
    const [order, setOrder] = useState<number[]>(() => carts.map((cart) => cart.id));
    const [panelOpen, setPanelOpen] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [sortMode, setSortMode] = useState<"manual" | "value" | "lines">("manual");

    const byId = useMemo(() => {
        const map = new Map<number, CartSummary>();
        carts.forEach((cart) => map.set(cart.id, cart));
        return map;
    }, [carts]);

    const ordered = useMemo(
        () => order.map((id) => byId.get(id)).filter((cart): cart is CartSummary => Boolean(cart)),
        [order, byId],
    );

    const active = ordered[0];
    const others = ordered.slice(1);

    /** Other carts as the panel shows them — manual order, or sorted on a key. */
    const panelCarts = useMemo(() => {
        if (sortMode === "value") return [...others].sort((a, b) => b.total - a.total);
        if (sortMode === "lines") return [...others].sort((a, b) => b.line_count - a.line_count);
        return others;
    }, [others, sortMode]);

    const persist = (next: number[]) => {
        setOrder(next);
        router.post(route("seller.carts.reorder"), { order: next }, { preserveScroll: true });
    };

    /** Move a cart to the front, making it the one on screen. */
    const promote = (id: number) => {
        persist([id, ...order.filter((entry) => entry !== id)]);
        setSelected([]);
        setPanelOpen(false);
    };

    /** Manual reordering inside the panel. Disabled while a sort is applied. */
    const nudge = (id: number, direction: -1 | 1) => {
        const index = order.indexOf(id);
        const target = index + direction;
        if (index < 1 || target < 1 || target >= order.length) return;

        const next = [...order];
        [next[index], next[target]] = [next[target], next[index]];
        persist(next);
    };

    const groups = useMemo(() => {
        if (!active) return [] as Array<["local" | "hub", CartLine[]]>;

        return (["local", "hub"] as const)
            .map((key) => [key, active.lines.filter((line) => line.fulfillment === key)] as const)
            .filter(([, lines]) => lines.length > 0)
            .map((entry) => entry as ["local" | "hub", CartLine[]]);
    }, [active]);

    const allLineIds = active?.lines.map((line) => line.id) ?? [];
    const allSelected = allLineIds.length > 0 && selected.length === allLineIds.length;

    const toggleLine = (id: number) =>
        setSelected((current) =>
            current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
        );

    const toggleGroup = (lines: CartLine[]) => {
        const ids = lines.map((line) => line.id);
        const every = ids.every((id) => selected.includes(id));

        setSelected((current) =>
            every
                ? current.filter((id) => !ids.includes(id))
                : Array.from(new Set([...current, ...ids])),
        );
    };

    const selectedTotal = (active?.lines ?? [])
        .filter((line) => selected.includes(line.id))
        .reduce((sum, line) => sum + line.line_total, 0);

    return (
        <>
            <Head title="Carts" />

            <div className="min-h-screen bg-surface-container-lowest pb-44">
                {/* ── Top bar ── */}
                <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface-container-lowest px-4 pb-2 pt-3">
                    <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center space-x-3">
                            <button
                                type="button"
                                onClick={() =>
                                    window.history.length > 1
                                        ? window.history.back()
                                        : router.visit(route("seller.dashboard"))
                                }
                                aria-label="Back"
                                className="-ml-1 p-1 text-on-surface active:scale-90"
                            >
                                <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                            </button>
                            <h1 className="truncate text-xl font-bold tracking-tight text-on-surface">
                                Cart ({active?.line_count ?? 0})
                            </h1>
                        </div>

                        <div className="flex items-center space-x-3 text-on-surface">
                            {home_store ? (
                                <div className="flex items-center space-x-1">
                                    <span className="material-symbols-outlined text-[17px] text-on-surface-variant">
                                        location_on
                                    </span>
                                    <span className="max-w-[70px] truncate text-xs font-medium text-on-surface-variant">
                                        {home_store}
                                    </span>
                                </div>
                            ) : null}

                            {/* Other carts */}
                            <button
                                type="button"
                                onClick={() => setPanelOpen((open) => !open)}
                                aria-label="Other carts"
                                aria-expanded={panelOpen}
                                className="relative p-1 text-on-surface-variant active:scale-90"
                            >
                                <span className="material-symbols-outlined text-[21px]">shopping_bag</span>
                                {others.length > 0 ? (
                                    <span
                                        className="absolute -right-1 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-[999px] px-1 font-mono text-[9px] font-bold text-on-primary bg-primary"
                                    >
                                        {others.length}
                                    </span>
                                ) : null}
                            </button>

                            <Link
                                href={route("seller.carts.create")}
                                aria-label="New cart"
                                className="p-1 text-on-surface-variant active:scale-90"
                            >
                                <span className="material-symbols-outlined text-[21px]">add_shopping_cart</span>
                            </Link>
                        </div>
                    </div>
                    {/* ── Other carts panel ── */}
                    {panelOpen ? (
                        <>
                            <button
                                type="button"
                                aria-label="Close other carts"
                                onClick={() => setPanelOpen(false)}
                                className="fixed inset-0 z-30 cursor-default bg-black/10"
                            />
                            <div className="absolute inset-x-0 top-full z-50 px-3">
                                <div className="relative ml-auto mt-2 w-[280px] rounded-[14px] border border-outline-variant bg-surface-container-lowest p-3 shadow-xl">
                                    <div className="absolute right-12 top-0 h-4 w-4 -translate-y-1/2 rotate-45 border-l border-t border-outline-variant bg-surface-container-lowest" />

                                    <div className="relative z-10 mb-1 flex items-center justify-between">
                                        <span className="text-xs font-bold text-on-surface">
                                            Other cart(s)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPanelOpen(false)}
                                            aria-label="Close"
                                            className="p-0.5 text-outline hover:text-on-surface-variant"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>

                                    <p className="relative z-10 mb-2 text-[10px] leading-tight text-on-surface-variant">
                                        Only the top cart is open on screen. Promote one to switch, or reorder
                                        to change the queue.
                                    </p>

                                    {/* Sort controls */}
                                    <div className="relative z-10 mb-2 flex items-center gap-1">
                                        {([
                                            { id: "manual", label: "Manual" },
                                            { id: "value", label: "Value" },
                                            { id: "lines", label: "Lines" },
                                        ] as const).map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setSortMode(option.id)}
                                                className={`rounded-[999px] border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                                                    sortMode === option.id
                                                        ? "border-primary bg-primary-container/60 text-primary"
                                                        : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative z-10 max-h-64 space-y-1.5 overflow-y-auto">
                                        {panelCarts.map((cart) => (
                                            <div
                                                key={cart.id}
                                                className="flex items-center justify-between gap-2 rounded-[10px] border border-outline-variant/60 bg-surface-container-low p-2"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => promote(cart.id)}
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                >
                                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[999px] border border-primary/20 bg-primary-container/60 text-primary">
                                                        <span className="material-symbols-outlined text-[14px]">
                                                            shopping_cart
                                                        </span>
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[11px] font-bold text-on-surface">
                                                            {cartLabel(cart)}
                                                        </span>
                                                        <span className="block text-[10px] leading-none text-on-surface-variant">
                                                            <span className="font-bold text-primary">
                                                                {cart.line_count}
                                                            </span>{" "}
                                                            line(s) · {birr(cart.total)}
                                                        </span>
                                                    </span>
                                                </button>

                                                {/* Manual reordering only makes sense in manual mode. */}
                                                {sortMode === "manual" ? (
                                                    <span className="flex shrink-0 flex-col">
                                                        <button
                                                            type="button"
                                                            onClick={() => nudge(cart.id, -1)}
                                                            aria-label={`Move ${cartLabel(cart)} up`}
                                                            disabled={order.indexOf(cart.id) <= 1}
                                                            className="text-outline disabled:opacity-25"
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]">
                                                                keyboard_arrow_up
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => nudge(cart.id, 1)}
                                                            aria-label={`Move ${cartLabel(cart)} down`}
                                                            disabled={order.indexOf(cart.id) >= order.length - 1}
                                                            className="text-outline disabled:opacity-25"
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]">
                                                                keyboard_arrow_down
                                                            </span>
                                                        </button>
                                                    </span>
                                                ) : null}
                                            </div>
                                        ))}

                                        {panelCarts.length === 0 ? (
                                            <p className="py-3 text-center text-[11px] text-outline">
                                                No other carts.
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </header>

                {/* ── Active cart ── */}
                {!active ? (
                    <div className="flex flex-col items-center px-6 py-20 text-center">
                        <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-primary-container">
                            <span className="material-symbols-outlined text-[40px] text-primary">
                                shopping_cart
                            </span>
                        </div>
                        <p className="mt-4 text-[16px] font-bold text-on-surface">
                            No active carts
                        </p>
                        <p className="mt-1 text-[12px] text-on-surface-variant">
                            Start a cart to build an order for a customer.
                        </p>
                        <Link
                            href={route("seller.carts.create")}
                            className="mt-4 rounded-[999px] px-5 py-2 text-[13px] font-bold text-on-primary active:scale-95 bg-primary"
                        >
                            New cart
                        </Link>
                    </div>
                ) : (
                    <main className="bg-surface-container-lowest">
                        {/* Whose cart is open */}
                        <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-[13px] font-bold text-on-surface">
                                    {cartLabel(active)}
                                </p>
                                <p className="truncate text-[11px] text-on-surface-variant">
                                    {active.seller?.name ?? "Unassigned"}
                                    {active.customer?.type === "business" ? " · Business" : ""}
                                </p>
                            </div>
                            <Link
                                href={route("seller.carts.show", active.id)}
                                className="flex shrink-0 items-center text-[11px] font-medium text-on-surface-variant hover:text-on-surface"
                            >
                                Open
                                <span className="material-symbols-outlined ml-0.5 text-xs">chevron_right</span>
                            </Link>
                        </div>

                        {groups.map(([key, lines], groupIndex) => {
                            const meta = FULFILLMENT[key];
                            const groupIds = lines.map((line) => line.id);
                            const groupChecked = groupIds.every((id) => selected.includes(id));

                            return (
                                <div
                                    key={key}
                                    className={groupIndex === 0 ? "pb-3" : "border-t-8 border-surface-container pb-3 pt-3.5"}
                                >
                                    <div className="px-4 pb-2 pt-3.5">
                                        <div className="flex items-center space-x-3">
                                            <SelectDot
                                                checked={groupChecked}
                                                onClick={() => toggleGroup(lines)}
                                            />
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span
                                                    className={`flex h-4 items-center rounded-[3px] px-1.5 text-[10px] font-extrabold leading-none ${meta.badgeClass}`}
                                                >
                                                    {meta.badge}
                                                </span>
                                                <span className="text-sm font-bold tracking-tight text-on-surface">
                                                    {meta.title}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="ml-8 mt-2 flex flex-wrap items-center gap-1.5">
                                            {meta.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="rounded bg-surface-container px-2 py-0.5 text-[10px] font-semibold text-on-surface"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                            <span className="ml-1 text-xs font-medium text-on-surface-variant">
                                                {lines.length} line{lines.length === 1 ? "" : "s"}
                                            </span>
                                        </div>

                                        {key === "hub" ? (
                                            <div className="ml-8 mt-2 flex flex-col space-y-0.5 rounded bg-warning-container/50 px-2.5 py-1.5">
                                                <div className="flex items-center space-x-1.5">
                                                    <span
                                                        className="material-symbols-outlined text-[13px] text-primary"
                                                    >
                                                        hourglass_top
                                                    </span>
                                                    <span className="text-[11px] font-bold text-on-surface">
                                                        Moves on the next scheduled shipment
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-on-surface-variant">
                                                    Consolidated at the hub before dispatch
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="divide-y divide-outline-variant/60">
                                        {lines.map((line) => (
                                            <div key={line.id} className="flex items-start space-x-3 px-4 py-3">
                                                <SelectDot
                                                    checked={selected.includes(line.id)}
                                                    onClick={() => toggleLine(line.id)}
                                                    className="mt-9"
                                                />

                                                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[10px] bg-surface-container">
                                                    <img
                                                        src={line.image}
                                                        alt={line.name}
                                                        className="h-full w-full object-cover"
                                                        loading="lazy"
                                                    />
                                                    {line.quantity <= 1 ? (
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-light text-white">
                                                            Single unit
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-2 text-xs font-medium leading-snug text-on-surface">
                                                        {line.name}
                                                    </p>

                                                    {line.variant_label ? (
                                                        <div className="mt-1 inline-flex items-center space-x-1 rounded border border-outline-variant/80 bg-surface-container-low px-1.5 py-0.5">
                                                            <span className="text-[11px] font-normal text-on-surface-variant">
                                                                {line.variant_label}
                                                            </span>
                                                        </div>
                                                    ) : null}

                                                    <div className="mt-2 flex items-center justify-between">
                                                        <div className="flex items-baseline space-x-1.5">
                                                            <span className="text-base font-bold leading-none tracking-tight text-on-surface">
                                                                {birr(line.price)}
                                                            </span>
                                                        </div>
                                                        <div className="flex h-6 items-center rounded-[999px] border border-outline-variant bg-surface-container-lowest px-2">
                                                            <span className="px-1 text-xs font-semibold text-on-surface">
                                                                ×{line.quantity}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {line.extra_pieces > 0 ? (
                                                        <div className="mt-0.5">
                                                            <span className="text-[11px] font-medium leading-none text-primary">
                                                                +{line.extra_pieces} loose piece(s)
                                                            </span>
                                                        </div>
                                                    ) : null}

                                                    <div className="mt-1 flex items-center text-[10px] text-outline">
                                                        <span className="truncate">
                                                            {line.sku ?? `Variant #${line.id}`}
                                                        </span>
                                                        <span className="ml-auto font-mono text-[10px] text-on-surface-variant">
                                                            {birr(line.line_total)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {active.lines.length === 0 ? (
                            <div className="px-4 py-14 text-center">
                                <span className="material-symbols-outlined text-[36px] text-outline">
                                    remove_shopping_cart
                                </span>
                                <p className="mt-2 text-[13px] font-bold text-on-surface">This cart is empty</p>
                                <p className="mt-1 text-[11px] text-outline">
                                    Add items from the catalogue to get started.
                                </p>
                            </div>
                        ) : null}
                    </main>
                )}
            </div>

            {/* ── Sticky checkout bar ── */}
            {active && active.lines.length > 0 ? (
                <section
                    className="fixed inset-x-0 z-40 mx-auto flex max-w-[480px] items-center justify-between rounded-t-[16px] border-t border-outline-variant/80 bg-surface-container-lowest px-4 py-2 shadow-[0_-4px_16px_rgb(var(--on-surface)/0.08)] dark:shadow-none"
                    style={{ bottom: ABOVE_NAV }}
                >
                    <div className="flex items-center space-x-2">
                        <SelectDot
                            checked={allSelected}
                            onClick={() => setSelected(allSelected ? [] : allLineIds)}
                        />
                        <span className="text-xs font-semibold text-on-surface-variant">All</span>
                    </div>

                    <div className="flex flex-col items-end pr-2">
                        <span className="text-[15px] font-bold leading-tight text-on-surface">
                            {birr(selected.length ? selectedTotal : active.total)}
                        </span>
                        <span className="mt-0.5 text-[10px] leading-none text-on-surface-variant">
                            {selected.length ? `${selected.length} selected` : "Cart total"}
                        </span>
                    </div>

                    <Link
                        href={`${route("seller.orders.confirmation")}?cart=${active.id}`}
                        className="flex flex-col items-center justify-center rounded-[999px] px-5 py-2 text-on-primary shadow-md active:scale-95 bg-primary"
                    >
                        <span className="text-xs font-bold leading-none tracking-wide">
                            Checkout ({selected.length || active.line_count})
                        </span>
                    </Link>
                </section>
            ) : null}
        </>
    );
}

CartsIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
