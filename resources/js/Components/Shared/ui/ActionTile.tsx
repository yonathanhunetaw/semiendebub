import { Link } from "@inertiajs/react";
import React from "react";
import { StatusPill } from "./StatusPill";
import { TONES, type Tone } from "./tones";

export interface ActionTileProps {
    label: string;
    caption?: string;
    /** Material Symbols ligature name. */
    icon: string;
    /** Resolved URL, or null while the destination does not exist yet ("Soon"). */
    href: string | null;
    /** Icon fill and hover accent (row variant only). */
    tone?: Tone;
    /** Small mono count before the chevron (row variant only). */
    count?: number;
    /** Gradient + border pair for the row shell (token classes); plain surface when omitted. */
    surface?: string;
    /**
     * `row`:  a full-width link row with icon square, caption and chevron.
     * `chip`: a compact icon + label link, as in a card footer grid.
     */
    variant?: "row" | "chip";
}

/** A way into a module: a row in an operations list, or a footer chip. */
export function ActionTile(props: ActionTileProps): React.ReactElement {
    return props.variant === "chip" ? <ActionChip {...props} /> : <ActionRow {...props} />;
}

function ActionRow({
    label,
    caption = "",
    icon,
    href,
    tone = "neutral",
    count,
    surface,
}: ActionTileProps): React.ReactElement {
    const body = (
        <>
            <div className="flex min-w-0 items-center space-x-2.5">
                <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] shadow-sm ${
                        href ? TONES[tone].badge : "bg-surface-container-highest text-on-surface-variant/60"
                    }`}
                >
                    <span className="material-symbols-outlined text-lg leading-none">{icon}</span>
                </div>
                <div className="flex min-w-0 flex-col">
                    <h4
                        className={`truncate text-xs font-bold leading-tight ${
                            href ? "text-on-surface" : "text-on-surface-variant/60"
                        }`}
                    >
                        {label}
                    </h4>
                    <span className="mt-0.5 truncate text-[10px] leading-none text-on-surface-variant">
                        {caption}
                    </span>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                {count != null && count > 0 ? (
                    <span className="font-mono text-[11px] font-semibold text-outline">{count}</span>
                ) : null}
                {!href ? <StatusPill label="Soon" tone="neutral" muted /> : null}
                <span
                    className={`material-symbols-outlined text-base leading-none text-outline transition-colors ${
                        href ? TONES[tone].hover : ""
                    }`}
                >
                    chevron_right
                </span>
            </div>
        </>
    );

    const shell = `flex items-center justify-between rounded-[12px] border px-3 py-2 ${
        href
            ? (surface ?? "border-outline-variant bg-surface-container-lowest")
            : "border-outline-variant/70 bg-surface-container-low/60"
    }`;

    return href ? (
        <Link href={href} className={`group ${shell} transition-colors hover:bg-surface-container-low`}>
            {body}
        </Link>
    ) : (
        <div aria-disabled="true" title={`${label} — not available yet`} className={`group ${shell} cursor-default`}>
            {body}
        </div>
    );
}

function ActionChip({ label, icon, href }: ActionTileProps): React.ReactElement {
    const body = (
        <>
            <span
                className={`material-symbols-outlined text-base ${
                    href ? "text-on-surface-variant" : "text-on-surface-variant/40"
                }`}
            >
                {icon}
            </span>
            <span className={`text-[11px] font-medium ${href ? "text-on-surface" : "text-on-surface-variant/60"}`}>
                {label}
            </span>
            {!href ? <StatusPill label="Soon" tone="neutral" muted size="xs" /> : null}
        </>
    );

    const shell = "flex items-center justify-center gap-1.5 rounded-[10px] bg-surface-container-low px-2 py-1";

    return href ? (
        <Link href={href} className={`${shell} transition-colors hover:bg-surface-container`}>
            {body}
        </Link>
    ) : (
        <div aria-disabled="true" title={`${label} — not available yet`} className={`${shell} cursor-default`}>
            {body}
        </div>
    );
}
