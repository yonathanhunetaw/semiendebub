import React from "react";

export interface EmptyStateProps {
    /** Material Symbols ligature name. */
    icon: string;
    title: string;
    description?: React.ReactNode;
    /** Optional call to action under the text (a Link or button). */
    action?: React.ReactNode;
    /** Draws the card shell around it, for use directly on the page background. */
    framed?: boolean;
    className?: string;
}

/** Nothing to show yet: a faded icon, a bold line and a short explanation. */
export function EmptyState({
    icon,
    title,
    description,
    action,
    framed = false,
    className = "",
}: EmptyStateProps): React.ReactElement {
    return (
        <div
            className={`text-center ${
                framed
                    ? "rounded-[16px] border border-outline-variant bg-surface-container-lowest px-4 py-6 shadow-sm"
                    : ""
            } ${className}`}
        >
            <span className="material-symbols-outlined text-[26px] text-on-surface-variant/40">{icon}</span>
            <p className="mt-1 text-[12px] font-bold text-on-surface">{title}</p>
            {description ? <p className="mt-0.5 text-[10px] text-on-surface-variant">{description}</p> : null}
            {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
        </div>
    );
}
