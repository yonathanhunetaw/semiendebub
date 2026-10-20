import React from "react";
import { addDays, addMonths, addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { Views, type View } from "react-big-calendar";
import { TONES } from "@/Components/Shared/ui";
import type { CalendarSourceInfo } from "@/types/calendar";

export const WEEK_STARTS_ON = 1; // Monday

export const VIEW_OPTIONS: Array<{ value: View; label: string }> = [
    { value: Views.MONTH, label: "Month" },
    { value: Views.WEEK, label: "Week" },
    { value: Views.DAY, label: "Day" },
    { value: Views.AGENDA, label: "List" },
];

/** How far the List view reaches: react-big-calendar shows `date` through `date + AGENDA_DAYS`. */
export const AGENDA_DAYS = 30;

export function isView(value: unknown): value is View {
    return VIEW_OPTIONS.some((v) => v.value === value);
}

/** The date one step back or forward in this view. */
export function stepDate(view: View, date: Date, direction: 1 | -1): Date {
    switch (view) {
        case Views.WEEK:
            return addWeeks(date, direction);
        case Views.DAY:
            return addDays(date, direction);
        case Views.AGENDA:
            return addDays(date, direction * AGENDA_DAYS);
        default:
            return addMonths(date, direction);
    }
}

/** "October 2026", "Oct 19 – 25", "Tue, Oct 20", "Oct 20 – Nov 20" or "Dec 29, 2026 – Jan 4, 2027". */
export function rangeLabel(view: View, date: Date): string {
    if (view === Views.MONTH) return format(date, "MMMM yyyy");
    if (view === Views.DAY) return format(date, "EEE, MMM d");

    const from = view === Views.WEEK ? startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }) : date;
    const to = view === Views.WEEK ? endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }) : addDays(date, AGENDA_DAYS);

    if (from.getFullYear() !== to.getFullYear()) return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;

    return from.getMonth() === to.getMonth()
        ? `${format(from, "MMM d")} – ${format(to, "d")}`
        : `${format(from, "MMM d")} – ${format(to, "MMM d")}`;
}

interface Props {
    scopeLabel: string;
    view: View;
    date: Date;
    loading: boolean;
    late: number;
    sources: CalendarSourceInfo[];
    hidden: string[];
    counts: Record<string, number>;
    onToggleSource: (key: string) => void;
    onNavigate: (date: Date) => void;
    onView: (view: View) => void;
    onUpload: () => void;
    onAdd: () => void;
}

/**
 * The top of the calendar in two slim rows: what it is and the actions, then
 * where you are and how you look at it. The source filters sit in a menu
 * (with a dot when some are hidden) instead of a row of chips.
 */
export default function CalendarHeader({
    scopeLabel,
    view,
    date,
    loading,
    late,
    sources,
    hidden,
    counts,
    onToggleSource,
    onNavigate,
    onView,
    onUpload,
    onAdd,
}: Props) {
    const [filtering, setFiltering] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);
    // Stored hidden keys can name sources this app no longer has.
    const filtered = sources.some((s) => hidden.includes(s.key));

    React.useEffect(() => {
        if (!filtering) return;
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setFiltering(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [filtering]);

    return (
        <div className="mb-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <h1 className="text-[18px] font-extrabold tracking-tight text-on-surface sm:text-[22px]">Calendar</h1>
                    <span className="truncate rounded-[8px] border border-outline-variant/60 bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
                        {scopeLabel}
                    </span>
                    {late > 0 ? (
                        <span className="shrink-0 rounded-[8px] bg-error-container px-2 py-0.5 text-[11px] font-extrabold text-on-error-container">{late} late</span>
                    ) : null}
                </div>

                <div className="relative flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        aria-label="Show or hide kinds of dates"
                        aria-expanded={filtering}
                        onClick={() => setFiltering((open) => !open)}
                        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-outline-variant text-on-surface-variant hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[20px]">filter_list</span>
                        {filtered ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-[999px] bg-primary" /> : null}
                    </button>
                    <button
                        type="button"
                        aria-label="Upload receipt"
                        onClick={onUpload}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-outline-variant text-on-surface-variant hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                    </button>
                    <button
                        type="button"
                        onClick={onAdd}
                        className="flex h-9 items-center gap-1 rounded-[10px] bg-primary px-3 text-[13px] font-bold text-on-primary hover:opacity-90"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Add
                    </button>

                    {filtering ? (
                        <>
                            <button type="button" aria-label="Close filters" className="fixed inset-0 z-30 cursor-default" onClick={() => setFiltering(false)} />
                            <div ref={menuRef} role="menu" className="absolute right-0 top-11 z-40 w-64 rounded-[14px] border border-outline-variant bg-surface-container-lowest p-1.5 shadow-lg">
                                {sources.map((s) => {
                                    const on = !hidden.includes(s.key);
                                    return (
                                        <button
                                            key={s.key}
                                            type="button"
                                            role="menuitemcheckbox"
                                            aria-checked={on}
                                            onClick={() => onToggleSource(s.key)}
                                            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-bold text-on-surface hover:bg-surface-container"
                                        >
                                            <span className={`h-2.5 w-2.5 shrink-0 rounded-[999px] ${on ? TONES[s.tone].badge : "bg-outline-variant"}`} />
                                            <span className={`flex-1 truncate ${on ? "" : "text-on-surface-variant/60 line-through"}`}>{s.label}</span>
                                            <span className="rounded-[999px] bg-surface-container px-1.5 text-[11px] tabular-nums text-on-surface-variant">{counts[s.key] ?? 0}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : null}
                </div>
            </div>

            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onNavigate(new Date())}
                        className="rounded-[8px] border border-outline-variant bg-surface-container px-2.5 py-1 text-[12px] font-bold text-on-surface hover:bg-surface-container-high"
                    >
                        Today
                    </button>
                    <button type="button" aria-label="Previous" onClick={() => onNavigate(stepDate(view, date, -1))} className="rounded-[8px] p-1 text-on-surface-variant hover:bg-surface-container">
                        <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                    </button>
                    <button type="button" aria-label="Next" onClick={() => onNavigate(stepDate(view, date, 1))} className="rounded-[8px] p-1 text-on-surface-variant hover:bg-surface-container">
                        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                    </button>
                    <h2 className="ml-1 truncate text-[14px] font-extrabold text-on-surface sm:text-[16px]">{rangeLabel(view, date)}</h2>
                    {loading ? <span className="material-symbols-outlined ml-1 animate-spin text-[16px] text-on-surface-variant">progress_activity</span> : null}
                </div>

                <select
                    aria-label="View"
                    value={view}
                    onChange={(event) => onView(event.target.value as View)}
                    className="shrink-0 rounded-[10px] border border-outline-variant bg-surface-container-lowest py-1 pl-2.5 pr-8 text-[12px] font-bold text-on-surface sm:hidden"
                >
                    {VIEW_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                            {v.label}
                        </option>
                    ))}
                </select>
                <div className="hidden shrink-0 rounded-[10px] border border-outline-variant bg-surface-container-lowest p-0.5 sm:flex">
                    {VIEW_OPTIONS.map((v) => (
                        <button
                            key={v.value}
                            type="button"
                            aria-pressed={view === v.value}
                            onClick={() => onView(v.value)}
                            className={`rounded-[8px] px-2.5 py-1 text-[12px] font-bold ${view === v.value ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"}`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
