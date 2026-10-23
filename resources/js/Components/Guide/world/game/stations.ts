/**
 * Stations: the desks of the world, as data (`node --test` runs the rules).
 *
 * Every module of the ERP that is not a walk-and-carry job is a station: a
 * desk in the world that lists what that module has waiting right now, and
 * offers the same actions its own page does. The server builds each station
 * for the viewer (App\Services\Guide\StationFeed): what to list, which
 * actions the viewer may take, and the route each calls. The world only
 * shows them and posts to that route: there is no game endpoint, so the same
 * permission checks decide and the same records are made.
 *
 * Practice runs an action as a rehearsal (nothing is sent); Live sends it.
 */

export type FieldType = "number" | "text" | "textarea" | "select";

export interface StationField {
    /** The name sent to the route. A dotted name builds nested data: `counts.12.received` → `{ counts: { 12: { received } } }`. */
    name: string;
    label: string;
    type: FieldType;
    options?: Array<{ value: string; label: string }>;
    /** What the field starts as. */
    default?: string | number | null;
    min?: number;
    max?: number;
    required?: boolean;
}

export type Tone = "primary" | "success" | "warning" | "error" | "inherit";

export interface StationAction {
    key: string;
    label: string;
    tone?: Tone;
    method: "post" | "put" | "patch" | "delete";
    /** The route's path on the viewer's own app (Ziggy, resolved by the server). */
    url: string;
    /** Fixed data sent with it. */
    data?: Record<string, unknown>;
    /** What the person fills in first (a count, a note, a choice). */
    fields?: StationField[];
    /** Ask first, with this text (money, deleting). */
    confirm?: string;
    /** The route answers with a redirect to another page: the world leaves for it, so the button says so. */
    navigates?: boolean;
}

export interface StationChip {
    label: string;
    tone?: "default" | "info" | "success" | "warning" | "error";
}

export interface StationItem {
    id: string;
    title: string;
    subtitle?: string;
    /** More lines of detail (each a short sentence). */
    lines?: string[];
    chips?: StationChip[];
    actions: StationAction[];
}

export interface Station {
    key: string;
    label: string;
    /** The desk the world draws it at (zones.ts). */
    desk: string;
    blurb?: string;
    /** Shown when nothing is waiting. */
    empty?: string;
    /** The module's own page on the viewer's app, to open for what a desk cannot do. */
    open?: { label: string; url: string };
    /** More pages of the module on the viewer's app (a desk can only do part of what a module does). */
    links?: Array<{ label: string; url: string }>;
    /** To read rather than do (the staff board, today's calendar): its items are not counted as work waiting. */
    info?: boolean;
    /** Facts to show at the top: "3 to pick", "12 on the shelf". */
    stats?: Array<{ label: string; value: string | number }>;
    items: StationItem[];
}

export type Values = Record<string, string | number>;

/** What a field starts as. */
export function initialValues(fields: StationField[] | undefined): Values {
    const values: Values = {};
    for (const field of fields ?? []) values[field.name] = field.default ?? (field.type === "number" ? 0 : "");
    return values;
}

/** Builds the data to send: the action's fixed data, then the fields, dotted names nested. */
export function buildPayload(action: StationAction, values: Values): Record<string, unknown> {
    const data: Record<string, unknown> = structuredClone(action.data ?? {});
    for (const field of action.fields ?? []) {
        const raw = values[field.name];
        // An empty optional field is left out, so the route's own default applies.
        if ((raw === "" || raw === undefined) && !field.required) continue;
        const value = field.type === "number" ? Number(raw) : raw;
        const path = field.name.split(".");
        let at = data;
        for (const part of path.slice(0, -1)) {
            const next = at[part];
            at = (typeof next === "object" && next !== null ? next : (at[part] = {})) as Record<string, unknown>;
        }
        at[path[path.length - 1]] = value;
    }
    return data;
}

/** What is wrong with the values typed, in words for the worker; null when they can be sent. */
export function whatIsWrong(action: StationAction, values: Values): string | null {
    for (const field of action.fields ?? []) {
        const raw = values[field.name];
        const empty = raw === "" || raw === undefined;
        if (empty && field.required) return `${field.label} is needed.`;
        if (empty) continue;
        if (field.type === "number") {
            const n = Number(raw);
            if (!Number.isFinite(n)) return `${field.label} must be a number.`;
            if (!Number.isInteger(n) && (field.min === undefined || Number.isInteger(field.min))) return `${field.label} must be a whole number.`;
            if (field.min !== undefined && n < field.min) return `${field.label} cannot be less than ${field.min}.`;
            if (field.max !== undefined && n > field.max) return `${field.label} cannot be more than ${field.max}.`;
        }
        if (field.type === "select" && field.options && !field.options.some((o) => o.value === String(raw))) return `Choose one for ${field.label}.`;
    }
    return null;
}

/** How many items of a station are work waiting (an info station has none). */
export function waitingCount(station: Station, struck: ReadonlySet<string>): number {
    return station.info ? 0 : visibleItems(station, struck).length;
}

/** The items still to show in Practice: an item whose action was rehearsed is struck off for the session. */
export function visibleItems(station: Station, struck: ReadonlySet<string>): StationItem[] {
    return station.items.filter((item) => !struck.has(`${station.key}:${item.id}`));
}

/** A station is worth lighting up when it has work, or says it is always there (a desk with stats or a link). */
export function isWorthShowing(station: Station, struck: ReadonlySet<string>): boolean {
    return visibleItems(station, struck).length > 0 || station.open !== undefined || (station.links?.length ?? 0) > 0 || (station.stats?.length ?? 0) > 0;
}
