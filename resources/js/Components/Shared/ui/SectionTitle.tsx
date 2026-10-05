import { Link } from "@inertiajs/react";
import React from "react";

export interface SectionTitleAction {
    label: string;
    /** Resolved URL; the action is hidden when null. */
    href: string | null;
}

export interface SectionTitleProps {
    title: React.ReactNode;
    /**
     * `title`: 13px bold heading (pipeline cards).
     * `caps`:  small uppercase, tracked heading (operations lists).
     */
    variant?: "title" | "caps";
    /** Heading element; defaults to h2 for `title`, h3 for `caps`. */
    as?: "h1" | "h2" | "h3" | "h4";
    /** Inline next to the title, e.g. a `<StatusPill label="Preview" />`. */
    badge?: React.ReactNode;
    /** Right-aligned mono note, e.g. "Core Tools". */
    note?: React.ReactNode;
    /** Right-aligned "label >" link. Takes precedence over `note`. */
    action?: SectionTitleAction;
    className?: string;
}

/** The header row of a Card: title on the left, note or action on the right. */
export function SectionTitle({
    title,
    variant = "title",
    as,
    badge,
    note,
    action,
    className = "mb-3",
}: SectionTitleProps): React.ReactElement {
    const Heading = as ?? (variant === "caps" ? "h3" : "h2");
    const headingClass =
        variant === "caps"
            ? "text-xs font-bold uppercase tracking-wider text-on-surface"
            : "text-[13px] font-bold text-on-surface";

    const heading = <Heading className={headingClass}>{title}</Heading>;

    return (
        <div className={`flex items-center justify-between ${className}`}>
            {badge ? (
                <div className="flex items-center gap-1.5">
                    {heading}
                    {badge}
                </div>
            ) : (
                heading
            )}

            {action ? (
                action.href ? (
                    <Link
                        href={action.href}
                        className="flex items-center text-[11px] font-medium text-on-surface-variant hover:text-on-surface"
                    >
                        <span>{action.label}</span>
                        <span className="material-symbols-outlined ml-0.5 text-xs">chevron_right</span>
                    </Link>
                ) : null
            ) : note != null ? (
                <span className="font-mono text-[10px] text-outline">{note}</span>
            ) : null}
        </div>
    );
}
