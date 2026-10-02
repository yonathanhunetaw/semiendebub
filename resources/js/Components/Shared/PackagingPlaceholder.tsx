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
     * Deliberately has no `dark:` variants. Tailwind's dark variant uses the
     * `media` strategy in this project (tailwind.config.js sets no darkMode
     * key), so it follows the operating system — while the app's own dark mode
     * is MUI's palette mode, which is independent and defaults to light. The
     * two disagreed, and a light storefront card ended up holding a dark
     * placeholder on any machine set to dark. Surfaces that really are dark
     * pass their own override through `className`.
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
        tone: "bg-slate-100 border-slate-200",
        iconTone: "text-slate-400",
    },
    doz: {
        Icon: Boxes,
        badge: "12x",
        tone: "bg-emerald-50 border-emerald-200/70",
        iconTone: "text-emerald-600",
    },
    packet: {
        Icon: PackageOpen,
        tone: "bg-sky-50 border-sky-200/70",
        iconTone: "text-sky-600",
    },
    bundle: {
        Icon: Layers,
        tone: "bg-violet-50 border-violet-200/70",
        iconTone: "text-violet-600",
    },
    box: {
        Icon: Package,
        tone: "bg-blue-50 border-blue-200/70",
        iconTone: "text-blue-600",
    },
    bag: {
        Icon: ShoppingBag,
        tone: "bg-rose-50 border-rose-200/70",
        iconTone: "text-rose-600",
    },
    cartoon: {
        Icon: Archive,
        tone: "bg-amber-50 border-amber-200/70",
        iconTone: "text-amber-700",
    },
};

const UNKNOWN: TierVisual = {
    Icon: ImageOff,
    tone: "bg-slate-50 border-slate-200",
    iconTone: "text-slate-300",
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
                className={`relative rounded-full bg-white/80 shadow-sm ring-1 ring-black/5 ${metrics.ring}`}
            >
                <Icon size={metrics.icon} strokeWidth={1.5} className={iconTone} />

                {badge ? (
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-600 px-1 text-[9px] font-bold leading-4 text-white">
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
