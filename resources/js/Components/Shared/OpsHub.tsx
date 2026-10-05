import { Link } from "@inertiajs/react";
import React from "react";

/**
 * The operations-hub card set.
 *
 * Lifted verbatim out of Pages/Seller/Menu/Index.tsx so the admin inventory
 * hub is the same UI rather than a second implementation of it. Two notes on
 * styling, because this project's tailwind.config.js overrides parts of the
 * default scale:
 *  - `rounded-full` is redefined to 0.75rem and `rounded-xl`/`rounded-lg` to
 *    0.5rem/0.25rem, so every radius here is an explicit arbitrary value.
 *    Pills and circles use `rounded-[999px]`.
 *  - Tailwind 3 has no `shadow-xs`; `shadow-sm` is the equivalent.
 *
 * Colors are theme tokens only (resources/js/theme): `primary` follows the
 * module's role color, the status tones are the same in every module, and
 * neutrals are the surface / on-surface scale, so the cards work in light
 * and dark mode.
 */

/**
 * Accent sets per tone, kept as literal class strings so the JIT compiler
 * sees them.
 *  - primary:  the module's role color
 *  - tertiary: the module's second accent (equals primary unless the role defines one)
 *  - info / success / warning / error: status colors, identical in every module
 *  - neutral:  ink on the surface scale
 */
export const TONES = {
    primary: { badge: "bg-primary text-on-primary", caption: "text-primary", hover: "group-hover:text-primary" },
    tertiary: { badge: "bg-tertiary text-on-tertiary", caption: "text-tertiary", hover: "group-hover:text-tertiary" },
    info: { badge: "bg-info text-on-info", caption: "text-info", hover: "group-hover:text-info" },
    success: { badge: "bg-success text-on-success", caption: "text-success", hover: "group-hover:text-success" },
    warning: { badge: "bg-warning text-on-warning", caption: "text-warning", hover: "group-hover:text-warning" },
    error: { badge: "bg-error text-on-error", caption: "text-error", hover: "group-hover:text-error" },
    neutral: {
        badge: "bg-inverse-surface text-inverse-on-surface",
        caption: "text-on-surface-variant",
        hover: "group-hover:text-on-surface",
    },
} as const;

export type Tone = keyof typeof TONES;

export interface Tile {
    label: string;
    caption: string;
    /** Material Symbols ligature name. */
    icon: string;
    count: number;
    tone: Tone;
    /** Standing warning: carries its accent even at rest, as the design does. */
    alert?: boolean;
    /** Query string appended to the card's action route, e.g. `tab=paid`. */
    tab?: string;
    /** Overrides the card's action route for this tile alone. */
    routeName?: string;
    /** Named route parameters, when `routeName` takes any. */
    routeParams?: Record<string, string | number>;
    /** Badge text in place of the count, e.g. "1.2k" for a stock total. */
    badge?: string;
    /** Shown for the layout but not backed by data yet: no link, no badge. */
    disabled?: boolean;
}

export interface Row {
    label: string;
    caption: string;
    icon: string;
    /** Registered route name, or null while the module has no page yet. */
    route: string | null;
    routeParams?: Record<string, string | number>;
    tone: Tone;
    /** Gradient + border pair for the row shell (token classes); plain surface when omitted. */
    surface?: string;
    count?: number;
}

/**
 * Resolve a route name, or null when Ziggy has no such route registered.
 *
 * Hub tiles are written ahead of the modules they point at, so an unresolved
 * name renders a "Soon" chip instead of throwing on render.
 */
export function href(
    name: string | null,
    params?: Record<string, string | number>,
): string | null {
    if (!name) return null;

    try {
        return params ? route(name, params) : route(name);
    } catch {
        return null;
    }
}


/** One stop on a location strip: an icon that opens a place stock sits in. */
export interface Place {
    key: string;
    label: string;
    caption: string;
    icon: string;
    /** Null renders the stop greyed out (the store has no such place). */
    routeName: string | null;
    routeParams?: Record<string, string | number>;
    /** Red count badge, e.g. shelf lines that need a refill. */
    alert?: number;
}

export interface PipelineCardProps {
    title: string;
    actionLabel: string;
    actionRoute: string | null;
    actionParams?: Record<string, string | number>;
    tiles: Tile[];
    /** Icon strip shown between the tiles and the footer links. */
    places?: Place[];
    footer?: Row[];
    /** Flags a card whose counts come from sample data, not the database. */
    preview?: boolean;
    /** Tiles per row. Defaults to 3 for six tiles, otherwise 5. */
    columns?: 3 | 4 | 5;
}

/** Literal class strings so the JIT compiler keeps them. */
const GRID_COLUMNS: Record<3 | 4 | 5, string> = {
    3: "grid-cols-3 gap-y-2",
    4: "grid-cols-4 gap-y-3",
    5: "grid-cols-5",
};

/**
 * Store Shelf → Store → Remote Hub → Main Hub A / B, nearest first.
 *
 * `activeKey` marks the place currently open; `bordered` draws the divider
 * used when the strip sits inside a PipelineCard.
 */
export function PlaceStrip({
    places,
    activeKey,
    bordered = true,
}: {
    places: Place[];
    activeKey?: string;
    bordered?: boolean;
}): React.ReactElement {
    return (
        <div className={`grid grid-cols-5 gap-1 py-2.5 text-center ${bordered ? "border-b border-outline-variant" : ""}`}>
            {places.map((place) => {
                const target = href(place.routeName, place.routeParams);
                const alert = place.alert ?? 0;
                const active = place.key === activeKey;

                const body = (
                    <>
                        <div
                            className={`relative flex h-9 w-9 items-center justify-center rounded-[10px] ${
                                active
                                    ? "bg-primary text-on-primary shadow-sm ring-2 ring-primary-container"
                                    : target
                                      ? "bg-inverse-surface text-inverse-on-surface shadow-sm"
                                      : "bg-surface-container text-on-surface-variant/40"
                            }`}
                        >
                            <span className="material-symbols-outlined text-[20px]">{place.icon}</span>
                            {alert > 0 ? (
                                <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-[999px] bg-error px-1 font-mono text-[8px] font-bold text-on-error shadow-sm">
                                    {alert > 99 ? "99+" : alert}
                                </span>
                            ) : null}
                        </div>
                        <span
                            className={`mt-1 text-[10px] font-bold leading-tight ${
                                target ? "text-on-surface" : "text-on-surface-variant/60"
                            }`}
                        >
                            {place.label}
                        </span>
                        <span className={`text-[8px] font-medium leading-tight ${target ? "text-on-surface-variant" : "text-on-surface-variant/40"}`}>
                            {place.caption}
                        </span>
                    </>
                );

                const shell = "group flex flex-col items-center rounded-[12px] p-1";

                return target ? (
                    <Link key={place.key} href={target} className={`${shell} transition-colors hover:bg-surface-container-low`}>
                        {body}
                    </Link>
                ) : (
                    <div key={place.key} aria-disabled="true" className={`${shell} cursor-default`}>
                        {body}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * A counter grid — 5-up, or 3-up over two rows when there are six tiles.
 *
 * Each tile is a counter plus a way in: it opens the card's list page with
 * `?tab=` preset, so the badge and the tab it lands on agree.
 */
export function PipelineCard({
    title,
    actionLabel,
    actionRoute,
    actionParams,
    tiles,
    places,
    footer,
    preview = false,
    columns,
}: PipelineCardProps): React.ReactElement {
    const target = href(actionRoute, actionParams);

    return (
        <section className="mb-3">
            <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-[13px] font-bold text-on-surface">
                            {title}
                        </h2>
                        {preview ? (
                            <span className="rounded-[999px] bg-surface-container px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">
                                Preview
                            </span>
                        ) : null}
                    </div>
                    {target ? (
                        <Link
                            href={target}
                            className="flex items-center text-[11px] font-medium text-on-surface-variant hover:text-on-surface"
                        >
                            <span>{actionLabel}</span>
                            <span className="material-symbols-outlined ml-0.5 text-xs">chevron_right</span>
                        </Link>
                    ) : null}
                </div>

                <div
                    className={`grid gap-1 text-center ${
                        GRID_COLUMNS[columns ?? (tiles.length === 6 ? 3 : 5)]
                    } ${footer && !places?.length ? "border-b border-outline-variant pb-3" : ""} ${
                        places?.length ? "pb-1" : ""
                    }`}
                >
                    {tiles.map((tile) => {
                        const tone = TONES[tile.tone];
                        const own = tile.disabled
                            ? null
                            : tile.routeName
                              ? href(tile.routeName, tile.routeParams)
                              : target;
                        const badge = tile.disabled
                            ? null
                            : (tile.badge ?? (tile.count > 0 ? (tile.count > 99 ? "99+" : String(tile.count)) : null));
                        const tileTarget = own && tile.tab ? `${own}?${tile.tab}` : own;

                        const body = (
                            <>
                                <div
                                    className={`relative flex h-9 w-9 items-center justify-center transition-colors ${
                                        tile.alert ? tone.caption : "text-on-surface"
                                    } ${own && !tile.alert ? tone.hover : ""}`}
                                >
                                    <span className="material-symbols-outlined text-[22px]">{tile.icon}</span>
                                    {badge ? (
                                        <span
                                            className={`absolute -right-1 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-[999px] px-1 font-mono text-[8px] font-bold shadow-sm ${tone.badge}`}
                                        >
                                            {badge}
                                        </span>
                                    ) : null}
                                </div>
                                <span
                                    className={`mt-0.5 text-[10px] font-bold leading-tight ${
                                        tile.alert ? tone.caption : "text-on-surface"
                                    }`}
                                >
                                    {tile.label}
                                </span>
                                <span
                                    className={`text-[8px] font-medium leading-tight ${
                                        tile.disabled ? "text-on-surface-variant/60" : tone.caption
                                    }`}
                                >
                                    {tile.caption}
                                </span>
                            </>
                        );

                        const shell =
                            "group flex flex-col items-center rounded-[12px] p-1 transition-colors";

                        return tileTarget ? (
                            <Link
                                key={tile.label}
                                href={tileTarget}
                                className={`${shell} ${tile.alert ? "hover:bg-error-container/60" : "hover:bg-surface-container-low"}`}
                            >
                                {body}
                            </Link>
                        ) : (
                            <div key={tile.label} className={shell}>
                                {body}
                            </div>
                        );
                    })}
                </div>

                {places?.length ? <PlaceStrip places={places} /> : null}

                {footer ? (
                    <div className="grid grid-cols-2 gap-2 pt-2.5">
                        {footer.map((link) => {
                            const linkTarget = href(link.route, link.routeParams);

                            const body = (
                                <>
                                    <span
                                        className={`material-symbols-outlined text-base ${
                                            linkTarget ? "text-on-surface-variant" : "text-on-surface-variant/40"
                                        }`}
                                    >
                                        {link.icon}
                                    </span>
                                    <span
                                        className={`text-[11px] font-medium ${
                                            linkTarget ? "text-on-surface" : "text-on-surface-variant/60"
                                        }`}
                                    >
                                        {link.label}
                                    </span>
                                    {!linkTarget ? (
                                        <span className="rounded-[999px] bg-surface-container px-1.5 text-[9px] font-bold uppercase text-on-surface-variant/60">
                                            Soon
                                        </span>
                                    ) : null}
                                </>
                            );

                            const shell =
                                "flex items-center justify-center gap-1.5 rounded-[10px] bg-surface-container-low px-2 py-1";

                            return linkTarget ? (
                                <Link
                                    key={link.label}
                                    href={linkTarget}
                                    className={`${shell} transition-colors hover:bg-surface-container`}
                                >
                                    {body}
                                </Link>
                            ) : (
                                <div
                                    key={link.label}
                                    aria-disabled="true"
                                    title={`${link.label} — not available yet`}
                                    className={`${shell} cursor-default`}
                                >
                                    {body}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

/** One row of the operations list. */
export function OpsRow({ row }: { row: Row }): React.ReactElement {
    const target = href(row.route, row.routeParams);

    const body = (
        <>
            <div className="flex min-w-0 items-center space-x-2.5">
                <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] shadow-sm ${
                        target ? TONES[row.tone].badge : "bg-surface-container-highest text-on-surface-variant/60"
                    }`}
                >
                    <span className="material-symbols-outlined text-lg leading-none">{row.icon}</span>
                </div>
                <div className="flex min-w-0 flex-col">
                    <h4
                        className={`truncate text-xs font-bold leading-tight ${
                            target ? "text-on-surface" : "text-on-surface-variant/60"
                        }`}
                    >
                        {row.label}
                    </h4>
                    <span className="mt-0.5 truncate text-[10px] leading-none text-on-surface-variant">
                        {row.caption}
                    </span>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                {row.count != null && row.count > 0 ? (
                    <span className="font-mono text-[11px] font-semibold text-outline">{row.count}</span>
                ) : null}
                {!target ? (
                    <span className="rounded-[999px] bg-surface-container px-2 py-0.5 text-[9px] font-bold uppercase text-on-surface-variant/60">
                        Soon
                    </span>
                ) : null}
                <span
                    className={`material-symbols-outlined text-base leading-none text-outline transition-colors ${
                        target ? TONES[row.tone].hover : ""
                    }`}
                >
                    chevron_right
                </span>
            </div>
        </>
    );

    const shell = `flex items-center justify-between rounded-[12px] border px-3 py-2 ${
        target
            ? (row.surface ?? "border-outline-variant bg-surface-container-lowest")
            : "border-outline-variant/70 bg-surface-container-low/60"
    }`;

    return target ? (
        <Link href={target} className={`group ${shell} transition-colors hover:bg-surface-container-low`}>
            {body}
        </Link>
    ) : (
        <div
            aria-disabled="true"
            title={`${row.label} — not available yet`}
            className={`group ${shell} cursor-default`}
        >
            {body}
        </div>
    );
}

export interface OpsCardProps {
    title: string;
    note: string;
    rows: Row[];
    /** Two columns from `sm` up, for wide admin surfaces. */
    wide?: boolean;
    children?: React.ReactNode;
}

export function OpsCard({ title, note, rows, wide = false, children }: OpsCardProps): React.ReactElement {
    return (
        <section className="mb-3">
            <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                        {title}
                    </h3>
                    <span className="font-mono text-[10px] text-outline">{note}</span>
                </div>

                <div className={`grid gap-2.5 ${wide ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                    {rows.map((row) => (
                        <OpsRow key={row.label} row={row} />
                    ))}
                </div>

                {children}
            </div>
        </section>
    );
}
