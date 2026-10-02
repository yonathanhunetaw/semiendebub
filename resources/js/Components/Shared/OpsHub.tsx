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
 */

export const HUB_BRAND = "#c2410c";
export const HUB_INK = "#0b1c30";
export const HUB_PAGE_BG = "#F8F9FB";

/** Accent sets kept as literal class strings so the JIT compiler sees them. */
export const TONES = {
    amber: { badge: "bg-amber-600", caption: "text-amber-700", hover: "group-hover:text-amber-600" },
    blue: { badge: "bg-blue-600", caption: "text-blue-600", hover: "group-hover:text-blue-600" },
    brand: { badge: "bg-[#c2410c]", caption: "text-[#c2410c]", hover: "group-hover:text-[#c2410c]" },
    emerald: { badge: "bg-emerald-600", caption: "text-emerald-600", hover: "group-hover:text-emerald-600" },
    rose: { badge: "bg-rose-600", caption: "text-rose-600", hover: "group-hover:text-rose-600" },
    violet: { badge: "bg-violet-600", caption: "text-violet-600", hover: "group-hover:text-violet-600" },
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
}

export interface Row {
    label: string;
    caption: string;
    icon: string;
    /** Registered route name, or null while the module has no page yet. */
    route: string | null;
    routeParams?: Record<string, string | number>;
    tone: Tone | "ink";
    /** Gradient + border pair for the row shell; plain white when omitted. */
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

/** Icon-only square used by the row list. */
const ROW_ICON_BG: Record<Tone | "ink", string> = {
    amber: "bg-amber-500",
    blue: "bg-blue-600",
    brand: "bg-[#c2410c]",
    emerald: "bg-emerald-600",
    rose: "bg-rose-600",
    violet: "bg-violet-600",
    ink: "bg-[#0b1c30]",
};

const ROW_HOVER: Record<Tone | "ink", string> = {
    amber: "group-hover:text-amber-600",
    blue: "group-hover:text-blue-600",
    brand: "group-hover:text-[#c2410c]",
    emerald: "group-hover:text-emerald-600",
    rose: "group-hover:text-rose-600",
    violet: "group-hover:text-violet-600",
    ink: "group-hover:text-gray-800",
};

export interface PipelineCardProps {
    title: string;
    actionLabel: string;
    actionRoute: string | null;
    actionParams?: Record<string, string | number>;
    tiles: Tile[];
    footer?: Row[];
    /** Flags a card whose counts come from sample data, not the database. */
    preview?: boolean;
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
    footer,
    preview = false,
}: PipelineCardProps): React.ReactElement {
    const target = href(actionRoute, actionParams);

    return (
        <section className="mb-3">
            <div className="rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <h2 className="text-[13px] font-bold" style={{ color: HUB_INK }}>
                            {title}
                        </h2>
                        {preview ? (
                            <span className="rounded-[999px] bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                Preview
                            </span>
                        ) : null}
                    </div>
                    {target ? (
                        <Link
                            href={target}
                            className="flex items-center text-[11px] font-medium text-gray-500 hover:text-gray-800"
                        >
                            <span>{actionLabel}</span>
                            <span className="material-symbols-outlined ml-0.5 text-xs">chevron_right</span>
                        </Link>
                    ) : null}
                </div>

                <div
                    className={`grid gap-1 text-center ${
                        tiles.length === 6 ? "grid-cols-3 gap-y-2" : "grid-cols-5"
                    } ${footer ? "border-b border-gray-100 pb-3" : ""}`}
                >
                    {tiles.map((tile) => {
                        const tone = TONES[tile.tone];
                        const own = tile.routeName
                            ? href(tile.routeName, tile.routeParams)
                            : target;
                        const tileTarget = own && tile.tab ? `${own}?${tile.tab}` : own;

                        const body = (
                            <>
                                <div
                                    className={`relative flex h-9 w-9 items-center justify-center transition-colors ${
                                        tile.alert ? tone.caption : "text-gray-700"
                                    } ${own && !tile.alert ? tone.hover : ""}`}
                                >
                                    <span className="material-symbols-outlined text-[22px]">{tile.icon}</span>
                                    {tile.count > 0 ? (
                                        <span
                                            className={`absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-[999px] px-1 font-mono text-[8px] font-bold text-white shadow-sm ${tone.badge}`}
                                        >
                                            {tile.count > 99 ? "99+" : tile.count}
                                        </span>
                                    ) : null}
                                </div>
                                <span
                                    className={`mt-0.5 text-[10px] font-bold leading-tight ${
                                        tile.alert ? tone.caption : "text-gray-800"
                                    }`}
                                >
                                    {tile.label}
                                </span>
                                <span className={`text-[8px] font-medium leading-tight ${tone.caption}`}>
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
                                className={`${shell} ${tile.alert ? "hover:bg-rose-50/60" : "hover:bg-gray-50"}`}
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

                {footer ? (
                    <div className="grid grid-cols-2 gap-2 pt-2.5">
                        {footer.map((link) => {
                            const linkTarget = href(link.route, link.routeParams);

                            const body = (
                                <>
                                    <span
                                        className={`material-symbols-outlined text-base ${
                                            linkTarget ? "text-gray-500" : "text-slate-300"
                                        }`}
                                    >
                                        {link.icon}
                                    </span>
                                    <span
                                        className={`text-[11px] font-medium ${
                                            linkTarget ? "text-gray-800" : "text-slate-400"
                                        }`}
                                    >
                                        {link.label}
                                    </span>
                                    {!linkTarget ? (
                                        <span className="rounded-[999px] bg-slate-100 px-1.5 text-[9px] font-bold uppercase text-slate-400">
                                            Soon
                                        </span>
                                    ) : null}
                                </>
                            );

                            const shell =
                                "flex items-center justify-center gap-1.5 rounded-[10px] bg-gray-50 px-2 py-1";

                            return linkTarget ? (
                                <Link
                                    key={link.label}
                                    href={linkTarget}
                                    className={`${shell} transition-colors hover:bg-gray-100`}
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
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm ${
                        target ? ROW_ICON_BG[row.tone] : "bg-slate-300"
                    }`}
                >
                    <span className="material-symbols-outlined text-lg leading-none">{row.icon}</span>
                </div>
                <div className="flex min-w-0 flex-col">
                    <h4
                        className={`truncate text-xs font-bold leading-tight ${
                            target ? "text-gray-900" : "text-slate-400"
                        }`}
                    >
                        {row.label}
                    </h4>
                    <span className="mt-0.5 truncate text-[10px] leading-none text-gray-500">
                        {row.caption}
                    </span>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                {row.count != null && row.count > 0 ? (
                    <span className="font-mono text-[11px] font-semibold text-gray-400">{row.count}</span>
                ) : null}
                {!target ? (
                    <span className="rounded-[999px] bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                        Soon
                    </span>
                ) : null}
                <span
                    className={`material-symbols-outlined text-base leading-none text-gray-400 transition-colors ${
                        target ? ROW_HOVER[row.tone] : ""
                    }`}
                >
                    chevron_right
                </span>
            </div>
        </>
    );

    const shell = `flex items-center justify-between rounded-[12px] border px-3 py-2 ${
        target ? (row.surface ?? "border-gray-200 bg-white") : "border-slate-200/70 bg-slate-50/60"
    }`;

    return target ? (
        <Link href={target} className={`group ${shell} transition-colors hover:bg-gray-50`}>
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
            <div className="rounded-[16px] border border-gray-100 bg-white p-3.5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: HUB_INK }}>
                        {title}
                    </h3>
                    <span className="font-mono text-[10px] text-gray-400">{note}</span>
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
