import { Link } from "@inertiajs/react";
import React from "react";
import { TONES, type Tone } from "./tones";

export interface StatCardProps {
    label: string;
    caption: string;
    /** Material Symbols ligature name. */
    icon: string;
    tone: Tone;
    /** Count shown in the corner badge; hidden at 0, capped at "99+". */
    count?: number;
    /** Badge text in place of the count, e.g. "1.2k". */
    badge?: string;
    /** Standing warning: carries its accent even at rest. */
    alert?: boolean;
    /** Shown for the layout but not backed by data yet: no link, no badge. */
    disabled?: boolean;
    /** Resolved URL. Without one the tile renders as static. */
    href?: string | null;
}

/** "99+" past two digits; null when there is nothing to show. */
export function countBadge(count: number | undefined): string | null {
    if (!count || count <= 0) return null;
    return count > 99 ? "99+" : String(count);
}

/**
 * One counter tile of a pipeline grid: an icon with a count badge, a label
 * and a tone-colored caption. Place several in a grid inside a Card.
 */
export function StatCard({
    label,
    caption,
    icon,
    tone,
    count,
    badge,
    alert = false,
    disabled = false,
    href,
}: StatCardProps): React.ReactElement {
    const accent = TONES[tone];
    const target = disabled ? null : (href ?? null);
    const shown = disabled ? null : (badge ?? countBadge(count));

    const body = (
        <>
            <div
                className={`relative flex h-9 w-9 items-center justify-center transition-colors ${
                    alert ? accent.caption : "text-on-surface"
                } ${target && !alert ? accent.hover : ""}`}
            >
                <span className="material-symbols-outlined text-[22px]">{icon}</span>
                {shown ? (
                    <span
                        className={`absolute -right-1 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-[999px] px-1 font-mono text-[8px] font-bold shadow-sm ${accent.badge}`}
                    >
                        {shown}
                    </span>
                ) : null}
            </div>
            <span className={`mt-0.5 text-[10px] font-bold leading-tight ${alert ? accent.caption : "text-on-surface"}`}>
                {label}
            </span>
            <span
                className={`text-[8px] font-medium leading-tight ${
                    disabled ? "text-on-surface-variant/60" : accent.caption
                }`}
            >
                {caption}
            </span>
        </>
    );

    const shell = "group flex flex-col items-center rounded-[12px] p-1 transition-colors";

    return target ? (
        <Link
            href={target}
            className={`${shell} ${alert ? "hover:bg-error-container/60" : "hover:bg-surface-container-low"}`}
        >
            {body}
        </Link>
    ) : (
        <div className={shell}>{body}</div>
    );
}
