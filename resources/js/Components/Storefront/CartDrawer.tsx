import { Drawer } from "@mui/material";
import React from "react";

import type { StorefrontCart, StorefrontCartLine } from "@/types/storefront";
import {
    STOREFRONT_BRAND,
    formatPrice,
    resolveImage,
} from "./storefrontConstants";

export interface CartDrawerProps {
    open: boolean;
    onClose: () => void;
    cart: StorefrontCart;
    /** Set an absolute quantity on a line; 0 clears it. */
    onUpdateQuantity: (line: StorefrontCartLine, quantity: number) => void;
    onRemove: (line: StorefrontCartLine) => void;
    onCheckout: () => void;
    /** True while any cart mutation is in flight. */
    isBusy?: boolean;
    /** Drives the checkout copy: guests are told they will sign in first. */
    isAuthenticated: boolean;
}

/**
 * Slide-over cart for the current shopper.
 *
 * Single-cart by design: unlike the Seller workspace there is no cart picker,
 * vendor split or manifest here — one shopper, one cart.
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
                    backgroundColor: "#ffffff",
                    backgroundImage: "none",
                },
            }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-1.5">
                    <span
                        className="material-symbols-outlined text-[20px]"
                        style={{ color: STOREFRONT_BRAND, fontVariationSettings: "'FILL' 1" }}
                    >
                        shopping_cart
                    </span>
                    <h2 className="text-[15px] font-bold tracking-tight text-gray-900">
                        Your Cart
                    </h2>
                    {cart.item_count > 0 ? (
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-[#c2410c]">
                            {cart.item_count}
                        </span>
                    ) : null}
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close cart"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 active:scale-95"
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
            </div>

            {/* ── Lines ── */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {isEmpty ? (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <span className="material-symbols-outlined text-[40px] text-slate-300">
                            shopping_basket
                        </span>
                        <p className="mt-2 text-[13px] font-bold text-gray-900">
                            Your cart is empty
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                            Browse the shelves and add a few essentials.
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-4 rounded-xl px-4 py-2 text-[12px] font-bold text-white shadow-sm active:scale-95"
                            style={{ backgroundColor: STOREFRONT_BRAND }}
                        >
                            Start shopping
                        </button>
                    </div>
                ) : (
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
                )}
            </div>

            {/* ── Summary + checkout ── */}
            {isEmpty ? null : (
                <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-slate-500">
                            Subtotal ({cart.item_count} item
                            {cart.item_count === 1 ? "" : "s"})
                        </span>
                        <span className="text-[17px] font-extrabold tracking-tight text-gray-900">
                            {formatPrice(cart.subtotal)}
                        </span>
                    </div>

                    <p className="mt-1 text-[10px] text-slate-400">
                        Delivery and taxes are calculated at checkout.
                    </p>

                    <button
                        type="button"
                        onClick={onCheckout}
                        disabled={isBusy}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                        style={isBusy ? undefined : { backgroundColor: STOREFRONT_BRAND }}
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            lock
                        </span>
                        Proceed to Checkout
                    </button>

                    {!isAuthenticated ? (
                        <p className="mt-2 text-center text-[10px] font-medium text-slate-500">
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
}

function CartLineRow({
    line,
    isBusy,
    onUpdateQuantity,
    onRemove,
}: CartLineRowProps): React.ReactElement {
    const atStockCeiling =
        line.available_stock > 0 && line.quantity >= line.available_stock;

    return (
        <li className="flex gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-2.5">
            <img
                src={resolveImage(line.image_url)}
                alt={line.title}
                className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 object-cover"
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold leading-tight text-gray-900">
                            {line.title}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                            {line.variant_label}
                        </p>
                        {line.sku ? (
                            <p className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
                                {line.sku}
                            </p>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={() => onRemove(line)}
                        disabled={isBusy}
                        aria-label={`Remove ${line.title} from cart`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[16px]">
                            delete
                        </span>
                    </button>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                        <button
                            type="button"
                            onClick={() => onUpdateQuantity(line, line.quantity - 1)}
                            disabled={isBusy}
                            aria-label={`Decrease quantity of ${line.title}`}
                            className="flex h-7 w-6 items-center justify-center rounded-l-lg text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[14px]">
                                remove
                            </span>
                        </button>
                        <span className="w-6 text-center text-[11px] font-bold text-gray-900">
                            {line.quantity}
                        </span>
                        <button
                            type="button"
                            onClick={() => onUpdateQuantity(line, line.quantity + 1)}
                            disabled={isBusy || atStockCeiling}
                            aria-label={`Increase quantity of ${line.title}`}
                            title={atStockCeiling ? "No more units in stock" : undefined}
                            className="flex h-7 w-6 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined text-[14px]">
                                add
                            </span>
                        </button>
                    </div>

                    <div className="text-right">
                        <p className="text-[12px] font-extrabold text-gray-900">
                            {formatPrice(line.line_total)}
                        </p>
                        <p className="text-[9px] font-medium text-slate-400">
                            {formatPrice(line.unit_price)} each
                        </p>
                    </div>
                </div>
            </div>
        </li>
    );
}
