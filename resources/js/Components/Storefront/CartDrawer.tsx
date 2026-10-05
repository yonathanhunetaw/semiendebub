import { Drawer } from "@mui/material";
import React from "react";

import PackagingPlaceholder from "@/Components/Shared/PackagingPlaceholder";

import type {
    StorefrontCart,
    StorefrontCartLine,
    StorefrontSourcingGroup,
} from "@/types/storefront";
import {
    STOREFRONT_BRAND,
    formatPrice,
    hasImage,
    resolveImage,
} from "./storefrontConstants";

export interface CartDrawerProps {
    open: boolean;
    onClose: () => void;
    cart: StorefrontCart;
    /** Set an absolute quantity on a line; 0 clears it. */
    onUpdateQuantity: (line: StorefrontCartLine, quantity: number) => void;
    onRemove: (line: StorefrontCartLine) => void;
    /**
     * `acceptDelay` carries the buyer's agreement to wait for lines that can
     * only be sent from a main warehouse. The server refuses checkout without
     * it, so the button stays disabled until it is ticked.
     */
    onCheckout: (acceptDelay: boolean) => void;
    /** True while any cart mutation is in flight. */
    isBusy?: boolean;
    /** Drives the checkout copy: guests are told they will sign in first. */
    isAuthenticated: boolean;
}

/** Icon per node kind, nearest to furthest. */
const GROUP_ICONS: Record<string, string> = {
    shelf: "storefront",
    backroom: "inventory_2",
    store: "store",
    remote_warehouse: "warehouse",
    main_warehouse: "factory",
    other: "location_on",
};

/**
 * Slide-over cart for the current shopper.
 *
 * Single-cart by design: unlike the Seller workspace there is no cart picker,
 * vendor split or manifest here — one shopper, one cart.
 *
 * Lines are shown grouped by the closest location that can serve them, because
 * that is what decides when the order arrives. A group sourced from a main
 * warehouse is explicitly marked as arriving later, and checkout is blocked
 * until the buyer agrees to that wait — the same rule CheckoutService enforces
 * server-side, so the agreement cannot be skipped by posting directly.
 */
export default function CartDrawer({
    open,
    onClose,
    cart,
    onUpdateQuantity,
    onRemove,
    onCheckout,
    isBusy = false,
    isAuthenticated,
}: CartDrawerProps): React.ReactElement {
    const isEmpty = cart.lines.length === 0;

    const groups: StorefrontSourcingGroup[] = cart.sourcing_groups ?? [];
    const needsAgreement = Boolean(cart.requires_delay_agreement);
    const [acceptedDelay, setAcceptedDelay] = React.useState(false);

    // A changed basket is a changed promise: re-tick rather than carry an
    // agreement over to items the buyer has not seen the wait for.
    React.useEffect(() => {
        if (!needsAgreement) {
            setAcceptedDelay(false);
        }
    }, [needsAgreement, cart.delayed_line_count]);

    const lineFor = (variantId: number): StorefrontCartLine | undefined =>
        cart.lines.find((line) => line.variant_id === variantId);

    const checkoutBlocked = isBusy || (needsAgreement && !acceptedDelay);

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: "100%", sm: 400 },
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "background.paper",
                    backgroundImage: "none",
                },
            }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <span
                        className="material-symbols-outlined text-[20px]"
                        style={{ color: STOREFRONT_BRAND, fontVariationSettings: "'FILL' 1" }}
                    >
                        shopping_cart
                    </span>
                    <h2 className="text-[15px] font-bold tracking-tight text-on-surface">
                        Your Cart
                    </h2>
                    {cart.item_count > 0 ? (
                        <span className="rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-bold text-primary">
                            {cart.item_count}
                        </span>
                    ) : null}
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close cart"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container active:scale-95"
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
            </div>

            {/* ── Lines ── */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {isEmpty ? (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <span className="material-symbols-outlined text-[40px] text-outline/60">
                            shopping_basket
                        </span>
                        <p className="mt-2 text-[13px] font-bold text-on-surface">
                            Your cart is empty
                        </p>
                        <p className="mt-1 text-[11px] text-outline">
                            Browse the shelves and add a few essentials.
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-4 rounded-xl px-4 py-2 text-[12px] font-bold text-on-primary shadow-sm active:scale-95"
                            style={{ backgroundColor: STOREFRONT_BRAND }}
                        >
                            Start shopping
                        </button>
                    </div>
                ) : groups.length === 0 ? (
                    /* No grouping from the server: one flat list, as before. */
                    <ul className="space-y-2">
                        {cart.lines.map((line) => (
                            <CartLineRow
                                key={line.variant_id}
                                line={line}
                                isBusy={isBusy}
                                onUpdateQuantity={onUpdateQuantity}
                                onRemove={onRemove}
                            />
                        ))}
                    </ul>
                ) : (
                    <div className="space-y-4">
                        {groups.map((group) => (
                            <section key={group.key}>
                                <header
                                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                                        group.requires_agreement
                                            ? "border-warning/30 bg-warning-container"
                                            : "border-outline-variant bg-surface-container-low"
                                    }`}
                                >
                                    <span
                                        className="material-symbols-outlined text-[18px]"
                                        style={{
                                            color: group.requires_agreement
                                                ? "rgb(var(--warning))"
                                                : STOREFRONT_BRAND,
                                        }}
                                    >
                                        {GROUP_ICONS[group.key] ?? GROUP_ICONS.other}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[11px] font-bold text-on-surface">
                                            {group.label}
                                            <span className="font-medium text-on-surface-variant">
                                                {" · "}
                                                {group.location_name}
                                            </span>
                                        </p>
                                        <p
                                            className={`text-[10px] font-semibold ${
                                                group.requires_agreement
                                                    ? "text-on-warning-container"
                                                    : "text-success"
                                            }`}
                                        >
                                            {group.promise}
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-surface-container-lowest px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                                        {group.lines.length}
                                    </span>
                                </header>

                                <ul className="mt-2 space-y-2">
                                    {group.lines.map((groupLine) => {
                                        const line = lineFor(groupLine.variant_id);

                                        if (!line) return null;

                                        return (
                                            <CartLineRow
                                                key={line.variant_id}
                                                line={line}
                                                isBusy={isBusy}
                                                onUpdateQuantity={onUpdateQuantity}
                                                onRemove={onRemove}
                                                shortfall={
                                                    groupLine.fully_covered
                                                        ? null
                                                        : groupLine.available_here
                                                }
                                            />
                                        );
                                    })}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Summary + checkout ── */}
            {isEmpty ? null : (
                <div className="border-t border-outline-variant bg-surface-container-low/80 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-on-surface-variant">
                            Subtotal ({cart.item_count} item
                            {cart.item_count === 1 ? "" : "s"})
                        </span>
                        <span className="text-[17px] font-extrabold tracking-tight text-on-surface">
                            {formatPrice(cart.subtotal)}
                        </span>
                    </div>

                    <p className="mt-1 text-[10px] text-outline">
                        Delivery and taxes are calculated at checkout.
                    </p>

                    {/* The buyer's half of order sourcing. */}
                    {needsAgreement ? (
                        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-warning/30 bg-warning-container px-2.5 py-2">
                            <input
                                type="checkbox"
                                checked={acceptedDelay}
                                onChange={(event) => setAcceptedDelay(event.target.checked)}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                            />
                            <span className="text-[10px] leading-snug text-on-warning-container">
                                <strong className="font-bold">
                                    {cart.delayed_line_count} item
                                    {cart.delayed_line_count === 1 ? "" : "s"}
                                </strong>{" "}
                                will be sent from our main warehouse and arrive later than
                                the rest of your order. I agree to the longer delivery
                                time.
                            </span>
                        </label>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => onCheckout(acceptedDelay)}
                        disabled={checkoutBlocked}
                        title={
                            needsAgreement && !acceptedDelay
                                ? "Confirm you are happy to wait for the warehouse items"
                                : undefined
                        }
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold text-on-primary shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-container-highest disabled:text-on-surface-variant disabled:shadow-none"
                        style={checkoutBlocked ? undefined : { backgroundColor: STOREFRONT_BRAND }}
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            lock
                        </span>
                        Proceed to Checkout
                    </button>

                    {!isAuthenticated ? (
                        <p className="mt-2 text-center text-[10px] font-medium text-on-surface-variant">
                            You&rsquo;ll sign in or register next — your cart is saved.
                        </p>
                    ) : null}
                </div>
            )}
        </Drawer>
    );
}

interface CartLineRowProps {
    line: StorefrontCartLine;
    isBusy: boolean;
    onUpdateQuantity: (line: StorefrontCartLine, quantity: number) => void;
    onRemove: (line: StorefrontCartLine) => void;
    /**
     * Units the chosen location can actually cover, when it cannot cover the
     * whole line. Null when it can.
     */
    shortfall?: number | null;
}

function CartLineRow({
    line,
    isBusy,
    onUpdateQuantity,
    onRemove,
    shortfall = null,
}: CartLineRowProps): React.ReactElement {
    const atStockCeiling =
        line.available_stock > 0 && line.quantity >= line.available_stock;

    return (
        <li className="flex gap-2.5 rounded-2xl border border-outline-variant/80 bg-surface-container-lowest p-2.5">
            {hasImage(line.image_url) ? (
                <img
                    src={resolveImage(line.image_url)}
                    alt={line.title}
                    className="h-16 w-16 shrink-0 rounded-xl border border-outline-variant object-cover"
                />
            ) : (
                /* variant_label reads "Blue · A4 · Box of 12", so the
                   packaging tier can be classified straight out of it. */
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                    <PackagingPlaceholder
                        packaging={line.variant_label}
                        label=""
                        size="sm"
                    />
                </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold leading-tight text-on-surface">
                            {line.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-on-surface-variant">
                            {line.variant_label}
                        </p>
                        {line.sku ? (
                            <p className="mt-0.5 truncate font-mono text-[9px] text-outline">
                                {line.sku}
                            </p>
                        ) : null}
                        {/* Sub-units bought at the pack's rate are part of what
                            this line costs, so the line has to say so. */}
                        {line.extra_pieces > 0 ? (
                            <p className="mt-0.5 truncate text-[10px] font-bold text-primary">
                                + {line.extra_pieces} Piece
                                {line.extra_pieces === 1 ? "" : "s"} ×{" "}
                                {formatPrice(line.extra_piece_price)}
                            </p>
                        ) : null}
                        {shortfall !== null ? (
                            <p className="mt-0.5 text-[10px] font-semibold text-on-warning-container">
                                Only {shortfall} here — the rest follows on
                            </p>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={() => onRemove(line)}
                        disabled={isBusy}
                        aria-label={`Remove ${line.title} from cart`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-outline transition-colors hover:bg-error-container hover:text-error disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[16px]">
                            delete
                        </span>
                    </button>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-lg border border-outline-variant bg-surface-container-low">
                        <button
                            type="button"
                            onClick={() => onUpdateQuantity(line, line.quantity - 1)}
                            disabled={isBusy}
                            aria-label={`Decrease quantity of ${line.title}`}
                            className="flex h-7 w-6 items-center justify-center rounded-l-lg text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[14px]">
                                remove
                            </span>
                        </button>
                        <span className="w-6 text-center text-[11px] font-bold text-on-surface">
                            {line.quantity}
                        </span>
                        <button
                            type="button"
                            onClick={() => onUpdateQuantity(line, line.quantity + 1)}
                            disabled={isBusy || atStockCeiling}
                            aria-label={`Increase quantity of ${line.title}`}
                            title={atStockCeiling ? "No more units in stock" : undefined}
                            className="flex h-7 w-6 items-center justify-center rounded-r-lg text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[14px]">
                                add
                            </span>
                        </button>
                    </div>

                    <div className="text-right">
                        <p className="text-[12px] font-extrabold text-on-surface">
                            {formatPrice(line.line_total)}
                        </p>
                        <p className="text-[9px] font-medium text-outline">
                            {formatPrice(line.unit_price)} each
                        </p>
                    </div>
                </div>
            </div>
        </li>
    );
}
