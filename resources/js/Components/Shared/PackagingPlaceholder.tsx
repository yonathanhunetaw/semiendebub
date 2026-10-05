import React from "react";
import {
    Archive,
    Boxes,
    ImageOff,
    Package,
    PackageOpen,
    ShoppingBag,
    Layers,
    type LucideIcon,
} from "lucide-react";

import {
    PACKAGING_TIER_LABEL,
    classifyPackagingTier,
    type PackagingTier,
} from "@/Components/Seller/itemShowHelpers";

export interface PackagingPlaceholderProps {
    /**
     * Raw packaging name from the variant, e.g. "Box", "Cartoon", "Doz".
     * Anything classifyPackagingTier() cannot place falls back to a neutral
     * "no image" tile rather than guessing a shape.
     */
    packaging?: string | null;
    /** Shown under the icon instead of the tier name, e.g. a product title. */
    label?: string | null;
    /** `sm` suits a grid thumbnail, `lg` a product hero. */
    size?: "sm" | "md" | "lg";
    className?: string;
}

interface TierVisual {
    Icon: LucideIcon;
    /** Overlay badge, e.g. "12x" for a dozen. */
    badge?: string;
    /**
     * Container tone.
     *
     * Theme token classes, so the tile follows the app's own light/dark mode
     * (and the module accent for box / bundle) without `dark:` variants.
     * Tailwind's dark variant follows the operating system, not the app mode,
     * which is why it is not used here. Surfaces that really are dark pass
     * their own override through `className`.
     */
    tone: string;
    iconTone: string;
}

/**
 * Each tier gets a silhouette that reads as its physical form, so a shopper
 * can tell a single piece from a carton before any photograph loads.
 */
const TIER_VISUALS: Record<PackagingTier, TierVisual> = {
    piece: {
        Icon: Package,
        tone: "bg-surface-container border-outline-variant",
        iconTone: "text-outline",
    },
    doz: {
        Icon: Boxes,
        badge: "12x",
        tone: "bg-success-container border-success/30",
        iconTone: "text-success",
    },
    packet: {
        Icon: PackageOpen,
        tone: "bg-info-container border-info/30",
        iconTone: "text-info",
    },
    bundle: {
        Icon: Layers,
        tone: "bg-tertiary-container border-tertiary/30",
        iconTone: "text-tertiary",
    },
    box: {
        Icon: Package,
        tone: "bg-primary-container border-primary/30",
        iconTone: "text-primary",
    },
    bag: {
        Icon: ShoppingBag,
        tone: "bg-secondary-container border-secondary/30",
        iconTone: "text-secondary",
    },
    cartoon: {
        Icon: Archive,
        tone: "bg-warning-container border-warning/30",
        iconTone: "text-warning",
    },
};

const UNKNOWN: TierVisual = {
    Icon: ImageOff,
    tone: "bg-surface-container-low border-outline-variant",
    iconTone: "text-outline/60",
};

const SIZES = {
    sm: { pad: "p-2", icon: 20, ring: "p-2", text: "text-[9px]", gap: "gap-1" },
    md: { pad: "p-4", icon: 28, ring: "p-3", text: "text-[11px]", gap: "gap-2" },
    lg: { pad: "p-6", icon: 44, ring: "p-5", text: "text-[13px]", gap: "gap-3" },
} as const;

/**
 * Stand-in for a variant with no photograph.
 *
 * The catalogue has a packaging type for nearly every variant but a real
 * photograph for very few, and a generic grey "No Image" tile throws that
 * information away — a shopper looking at a grid of them cannot tell a single
 * piece from a carton of 240. This renders the packaging instead, which is the
 * one thing we do reliably know.
 *
 * Nothing is fetched and nothing is stored: it is inline SVG via lucide, so it
 * cannot 404 the way the seeded image keys did.
 */
export default function PackagingPlaceholder({
    packaging,
    label,
    size = "md",
    className = "",
}: PackagingPlaceholderProps): React.ReactElement {
    const tier = classifyPackagingTier(packaging);
    const visual = tier ? TIER_VISUALS[tier] : UNKNOWN;
    const { Icon, badge, tone, iconTone } = visual;
    const metrics = SIZES[size];

    const caption = label ?? (tier ? PACKAGING_TIER_LABEL[tier] : "No image");

    return (
        <div
            role="img"
            aria-label={
                tier
                    ? `No photograph yet — ${PACKAGING_TIER_LABEL[tier]} packaging`
                    : "No photograph yet"
            }
            className={`flex h-full w-full flex-col items-center justify-center border ${metrics.pad} ${metrics.gap} ${tone} ${className}`}
        >
            <div
                className={`relative rounded-full bg-surface-container-lowest/80 shadow-sm ring-1 ring-on-surface/5 ${metrics.ring}`}
            >
                <Icon size={metrics.icon} strokeWidth={1.5} className={iconTone} />

                {badge ? (
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-success px-1 text-[9px] font-bold leading-4 text-on-success">
                        {badge}
                    </span>
                ) : null}
            </div>

            <span
                className={`max-w-full truncate font-semibold uppercase tracking-wide opacity-70 ${metrics.text} ${iconTone}`}
            >
                {caption}
            </span>
        </div>
    );
}
