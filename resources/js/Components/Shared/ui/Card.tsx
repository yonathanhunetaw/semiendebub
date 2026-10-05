import React from "react";
import { SectionTitle, type SectionTitleProps } from "./SectionTitle";

export interface CardProps {
    /** Renders a SectionTitle header when given. */
    title?: React.ReactNode;
    titleVariant?: SectionTitleProps["variant"];
    titleAs?: SectionTitleProps["as"];
    badge?: SectionTitleProps["badge"];
    note?: SectionTitleProps["note"];
    action?: SectionTitleProps["action"];
    children?: React.ReactNode;
    /** Extra classes on the outer <section> (spacing, grid placement). */
    className?: string;
}

/**
 * The hub surface card: a rounded, bordered, lightly shadowed panel on the
 * page background, with an optional title row.
 */
export function Card({
    title,
    titleVariant,
    titleAs,
    badge,
    note,
    action,
    children,
    className = "mb-3",
}: CardProps): React.ReactElement {
    return (
        <section className={className}>
            <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-3.5 shadow-sm">
                {title != null ? (
                    <SectionTitle
                        title={title}
                        variant={titleVariant}
                        as={titleAs}
                        badge={badge}
                        note={note}
                        action={action}
                    />
                ) : null}
                {children}
            </div>
        </section>
    );
}
