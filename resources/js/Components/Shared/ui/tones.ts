/**
 * Accent sets per tone, kept as literal class strings so the JIT compiler
 * sees them. Shared by every component in Components/Shared/ui (and
 * re-exported from Components/Shared/OpsHub for its existing importers).
 *
 *  - primary:  the module's role color
 *  - tertiary: the module's second accent (equals primary unless the role defines one)
 *  - info / success / warning / error: status colors, identical in every module
 *  - neutral:  ink on the surface scale
 *
 * `badge` is the solid fill (icon squares, count badges), `caption` the
 * accent text, `hover` the accent a `group` parent lights up on hover, and
 * `pill` the soft container fill used by StatusPill.
 */
export const TONES = {
    primary: {
        badge: "bg-primary text-on-primary",
        caption: "text-primary",
        hover: "group-hover:text-primary",
        pill: "bg-primary-container text-on-primary-container",
    },
    tertiary: {
        badge: "bg-tertiary text-on-tertiary",
        caption: "text-tertiary",
        hover: "group-hover:text-tertiary",
        pill: "bg-tertiary-container text-on-tertiary-container",
    },
    info: {
        badge: "bg-info text-on-info",
        caption: "text-info",
        hover: "group-hover:text-info",
        pill: "bg-info-container text-on-info-container",
    },
    success: {
        badge: "bg-success text-on-success",
        caption: "text-success",
        hover: "group-hover:text-success",
        pill: "bg-success-container text-on-success-container",
    },
    warning: {
        badge: "bg-warning text-on-warning",
        caption: "text-warning",
        hover: "group-hover:text-warning",
        pill: "bg-warning-container text-on-warning-container",
    },
    error: {
        badge: "bg-error text-on-error",
        caption: "text-error",
        hover: "group-hover:text-error",
        pill: "bg-error-container text-on-error-container",
    },
    neutral: {
        badge: "bg-inverse-surface text-inverse-on-surface",
        caption: "text-on-surface-variant",
        hover: "group-hover:text-on-surface",
        pill: "bg-surface-container text-on-surface-variant",
    },
} as const;

export type Tone = keyof typeof TONES;

export const TONE_NAMES = Object.keys(TONES) as Tone[];
