import React from "react";
import { router } from "@inertiajs/react";
import { format } from "date-fns";
import { SkSheet } from "@/Components/StockKeeper/skKit";
import { sameHost } from "@/Components/Calendar/calendarUi";
import type { CalendarStarter } from "@/types/calendar";

export interface NewFromDayTarget {
    start: Date;
    end?: Date;
    allDay: boolean;
}

/** The module form's address for this day: `new=1`, the date (under each of its names) and, for a picked time, `time`. */
export function starterUrl(starter: CalendarStarter, target: NewFromDayTarget): string {
    const url = new URL(starter.url, window.location.href);
    const day = format(target.start, "yyyy-MM-dd");

    url.searchParams.set("new", "1");
    for (const name of starter.date_params) url.searchParams.set(name, day);
    if (!target.allDay) url.searchParams.set("time", format(target.start, "HH:mm"));

    return url.toString();
}

/**
 * "What do you want to put on this day?": a note or reminder (the calendar's
 * own entry), or one of the things the viewer may start in its own module,
 * which opens that module's form with the day filled in.
 */
export default function NewFromDay({
    target,
    starters,
    onNote,
    onClose,
}: {
    target: NewFromDayTarget | null;
    starters: CalendarStarter[];
    onNote: (target: NewFromDayTarget) => void;
    onClose: () => void;
}) {
    if (target === null) return null;

    const go = (starter: CalendarStarter) => {
        const url = starterUrl(starter, target);
        onClose();
        // Purchase orders live on the procurement app: another host, so a full page load.
        if (sameHost(url)) router.visit(url);
        else window.location.assign(url);
    };

    const when = target.allDay ? format(target.start, "EEEE d MMMM") : format(target.start, "EEEE d MMMM, HH:mm");

    return (
        <SkSheet open onClose={onClose} title="Add to this day" subtitle={when}>
            <ul className="flex flex-col gap-1.5">
                <li>
                    <Choice icon="edit_note" label="Note or reminder" hint="A reminder, bill, meeting or shift note on the calendar" onClick={() => onNote(target)} />
                </li>
                {starters.map((starter) => (
                    <li key={starter.key}>
                        <Choice icon={starter.icon} label={starter.label} hint="Opens its form with this day filled in" onClick={() => go(starter)} />
                    </li>
                ))}
            </ul>
        </SkSheet>
    );
}

function Choice({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-3 rounded-[14px] border border-outline-variant bg-surface-container-lowest px-3.5 py-3 text-left hover:border-primary hover:bg-surface-container"
        >
            <span className="material-symbols-outlined text-[22px] text-primary">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-on-surface">{label}</span>
                <span className="block truncate text-[12px] text-on-surface-variant">{hint}</span>
            </span>
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">chevron_right</span>
        </button>
    );
}
