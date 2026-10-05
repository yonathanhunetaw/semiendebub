import { Link } from "@inertiajs/react";
import React from "react";
import { ActionTile, Card, StatCard, StatusPill, TONES, type Tone } from "@/Components/Shared/ui";

/**
 * The operations-hub card set, used by the Seller "More" hub and the admin
 * inventory hub.
 *
 * The building blocks (Card, SectionTitle, StatCard, ActionTile, StatusPill)
 * live in Components/Shared/ui; this module composes them into the hub's
 * data-driven cards (PipelineCard, OpsCard, OpsRow) and keeps PlaceStrip.
 * TONES / Tone are re-exported from there so existing importers keep working.
 *
 * Styling notes, because this project's tailwind.config.js overrides parts of
 * the default scale:
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

export { TONES, type Tone };

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
        <Card
            title={title}
            badge={preview ? <StatusPill label="Preview" tone="neutral" size="sm" /> : undefined}
            action={{ label: actionLabel, href: target }}
        >
            <div
                className={`grid gap-1 text-center ${
                    GRID_COLUMNS[columns ?? (tiles.length === 6 ? 3 : 5)]
                } ${footer && !places?.length ? "border-b border-outline-variant pb-3" : ""} ${
                    places?.length ? "pb-1" : ""
                }`}
            >
                {tiles.map((tile) => {
                    const own = tile.disabled
                        ? null
                        : tile.routeName
                          ? href(tile.routeName, tile.routeParams)
                          : target;
                    const tileTarget = own && tile.tab ? `${own}?${tile.tab}` : own;

                    return (
                        <StatCard
                            key={tile.label}
                            label={tile.label}
                            caption={tile.caption}
                            icon={tile.icon}
                            tone={tile.tone}
                            count={tile.count}
                            badge={tile.badge}
                            alert={tile.alert}
                            disabled={tile.disabled}
                            href={tileTarget}
                        />
                    );
                })}
            </div>

            {places?.length ? <PlaceStrip places={places} /> : null}

            {footer ? (
                <div className="grid grid-cols-2 gap-2 pt-2.5">
                    {footer.map((link) => (
                        <ActionTile
                            key={link.label}
                            variant="chip"
                            label={link.label}
                            icon={link.icon}
                            href={href(link.route, link.routeParams)}
                        />
                    ))}
                </div>
            ) : null}
        </Card>
    );
}

/** One row of the operations list. */
export function OpsRow({ row }: { row: Row }): React.ReactElement {
    return (
        <ActionTile
            label={row.label}
            caption={row.caption}
            icon={row.icon}
            href={href(row.route, row.routeParams)}
            tone={row.tone}
            count={row.count}
            surface={row.surface}
        />
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
        <Card title={title} titleVariant="caps" note={note}>
            <div className={`grid gap-2.5 ${wide ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                {rows.map((row) => (
                    <OpsRow key={row.label} row={row} />
                ))}
            </div>

            {children}
        </Card>
    );
}
