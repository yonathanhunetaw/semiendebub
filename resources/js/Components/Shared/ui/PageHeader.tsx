import React from "react";

export interface PageHeaderProps {
    /** Material Symbols ligature name for the accent square. */
    icon: string;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Right-aligned controls (icon buttons, menus). */
    actions?: React.ReactNode;
    /** Replaces the title/subtitle block, e.g. a sign-in link for guests. */
    children?: React.ReactNode;
    className?: string;
}

/**
 * The identity header of a hub page: a role-colored icon square, a title
 * with a muted subtitle, and actions on the right.
 */
export function PageHeader({
    icon,
    title,
    subtitle,
    actions,
    children,
    className = "px-4 pb-3 pt-4",
}: PageHeaderProps): React.ReactElement {
    return (
        <section className={className}>
            <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center space-x-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-primary-container bg-primary text-on-primary shadow-sm">
                        <span className="material-symbols-outlined text-2xl">{icon}</span>
                    </div>

                    {children ?? (
                        <div className="min-w-0">
                            <h1 className="truncate text-[17px] font-bold tracking-tight text-on-surface">{title}</h1>
                            {subtitle != null ? (
                                <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">{subtitle}</p>
                            ) : null}
                        </div>
                    )}
                </div>

                {actions ? <div className="flex shrink-0 items-center space-x-1">{actions}</div> : null}
            </div>
        </section>
    );
}

export interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Material Symbols ligature name. */
    icon: string;
    /** Required: the button has no visible text. */
    "aria-label": string;
    /** Pressed / open look. */
    active?: boolean;
}

/** Round icon button for PageHeader actions. Links use `headerIconButtonClass`. */
export const headerIconButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-[999px] text-on-surface transition-all hover:bg-surface-container-high/60 active:scale-95";

export function HeaderIconButton({
    icon,
    active = false,
    className = "",
    type = "button",
    ...rest
}: HeaderIconButtonProps): React.ReactElement {
    return (
        <button
            type={type}
            {...rest}
            className={`flex h-9 w-9 items-center justify-center rounded-[999px] transition-all active:scale-95 ${
                active
                    ? "bg-surface-container-high/70 text-on-surface"
                    : "text-on-surface hover:bg-surface-container-high/60"
            } ${className}`}
        >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </button>
    );
}
