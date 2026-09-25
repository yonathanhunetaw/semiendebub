import { router } from "@inertiajs/react";
import React from "react";

import type {
    StorefrontCartLine,
    StorefrontFlash,
    StorefrontVariantOption,
} from "@/types/storefront";

export interface UseStorefrontCart {
    cartOpen: boolean;
    openCart: () => void;
    closeCart: () => void;
    /** True while any cart mutation is in flight. */
    isMutating: boolean;
    /** Variant currently being added, for a per-button spinner. */
    pendingVariantId: number | null;
    addVariant: (variant: StorefrontVariantOption, quantity: number) => void;
    updateQuantity: (line: StorefrontCartLine, quantity: number) => void;
    removeLine: (line: StorefrontCartLine) => void;
    checkout: () => void;
    notice: string | null;
    dismissNotice: () => void;
}

/**
 * Cart behaviour shared by the storefront grid and the item Show page.
 *
 * Every mutation is an Inertia visit scoped to `only: ["cart", "flash"]`, so
 * the server stays the single source of truth for prices, stock ceilings and
 * the badge count while the catalogue and scroll position stay put.
 */
export function useStorefrontCart(flash?: StorefrontFlash): UseStorefrontCart {
    const [cartOpen, setCartOpen] = React.useState<boolean>(false);
    const [isMutating, setIsMutating] = React.useState<boolean>(false);
    const [pendingVariantId, setPendingVariantId] = React.useState<number | null>(
        null,
    );
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) {
            setNotice(message);
        }
    }, [flash?.success, flash?.error]);

    const cartVisitOptions: {
        preserveScroll: boolean;
        preserveState: boolean;
        only: string[];
    } = {
        preserveScroll: true,
        preserveState: true,
        only: ["cart", "flash"],
    };

    const addVariant = (
        variant: StorefrontVariantOption,
        quantity: number,
    ): void => {
        setPendingVariantId(variant.id);

        router.post(
            route("storefront.cart.items.store"),
            { variant_id: variant.id, quantity },
            {
                ...cartVisitOptions,
                onSuccess: () => setCartOpen(true),
                onFinish: () => setPendingVariantId(null),
            },
        );
    };

    const updateQuantity = (
        line: StorefrontCartLine,
        quantity: number,
    ): void => {
        setIsMutating(true);

        router.patch(
            route("storefront.cart.items.update", line.variant_id),
            { quantity: Math.max(0, quantity) },
            { ...cartVisitOptions, onFinish: () => setIsMutating(false) },
        );
    };

    const removeLine = (line: StorefrontCartLine): void => {
        setIsMutating(true);

        router.delete(route("storefront.cart.items.destroy", line.variant_id), {
            ...cartVisitOptions,
            onFinish: () => setIsMutating(false),
        });
    };

    /**
     * Guests are redirected to sign in; the cart survives because it is keyed
     * to the pre-login session id and merged into the account server-side.
     */
    const checkout = (): void => {
        setIsMutating(true);

        router.post(
            route("storefront.checkout"),
            {},
            { preserveScroll: true, onFinish: () => setIsMutating(false) },
        );
    };

    return {
        cartOpen,
        openCart: () => setCartOpen(true),
        closeCart: () => setCartOpen(false),
        isMutating,
        pendingVariantId,
        addVariant,
        updateQuantity,
        removeLine,
        checkout,
        notice,
        dismissNotice: () => setNotice(null),
    };
}
