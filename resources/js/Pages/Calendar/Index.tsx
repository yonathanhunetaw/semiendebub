import React from "react";
import { Head, router } from "@inertiajs/react";
import { Calendar, dateFnsLocalizer, Views, type View, type SlotInfo } from "react-big-calendar";
import { addDays, endOfMonth, endOfWeek, format, getDay, parse, startOfMonth, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../../../css/calendar.css";
import AdminLayout from "@/Layouts/AdminLayout";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import SellerLayout from "@/Layouts/SellerLayout";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import FlashToast from "@/Components/Shared/FlashToast";
import CalendarHeader, { AGENDA_DAYS, VIEW_OPTIONS, WEEK_STARTS_ON, isView } from "@/Components/Calendar/CalendarHeader";
import EntryForm, { type EntryFormTarget } from "@/Components/Calendar/EntryForm";
import EventDetails from "@/Components/Calendar/EventDetails";
import { ReceiptReview, ReceiptUpload } from "@/Components/Calendar/ReceiptSheets";
import { KIND_ICON, calendarRoute, eventStart, money, parseDay } from "@/Components/Calendar/calendarUi";
import NewFromDay, { type NewFromDayTarget } from "@/Components/Calendar/NewFromDay";
import type { CalendarApp, CalendarEventData, CalendarSourceInfo, CalendarStarter, PendingDocument } from "@/types/calendar";

interface Props {
    app: CalendarApp;
    sources?: CalendarSourceInfo[];
    /** What the viewer may start from a day besides a note (transfer, shipment, shift…). */
    starters?: CalendarStarter[];
    initialDate?: string | null;
    /** "Main Store", "All stores", "Your runs". */
    scopeLabel: string;
    /** Is the receipt reader set up (ANTHROPIC_API_KEY)? */
    readerEnabled?: boolean;
    /** A receipt just uploaded, to check before it goes on the calendar. */
    pendingDocument?: PendingDocument | null;
}

interface CalEvent {
    title: string;
    start: Date;
    end: Date;
    allDay: boolean;
    resource: CalendarEventData;
}

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }),
    getDay,
    locales: { "en-US": enUS },
});

/** The days a view shows around `date`, as sent to the feed. */
function rangeFor(view: View, date: Date): { from: Date; to: Date } {
    switch (view) {
        case Views.WEEK:
            return { from: startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }), to: endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }) };
        case Views.DAY:
            return { from: date, to: date };
        case Views.AGENDA:
            return { from: date, to: addDays(date, AGENDA_DAYS) };
        default:
            return {
                from: startOfWeek(startOfMonth(date), { weekStartsOn: WEEK_STARTS_ON }),
                to: endOfWeek(endOfMonth(date), { weekStartsOn: WEEK_STARTS_ON }),
            };
    }
}

/** react-big-calendar wants an exclusive end for all-day events, and an end for every event. */
function toCalEvent(e: CalendarEventData): CalEvent {
    const start = eventStart(e);
    if (e.all_day) {
        return { title: e.title, start, end: addDays(e.end ? parseDay(e.end) : start, 1), allDay: true, resource: e };
    }
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 30 * 60 * 1000);
    return { title: e.title, start, end, allDay: false, resource: e };
}

function readStored<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function store(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private window or blocked storage: the choice just isn't remembered.
    }
}

/**
 * The calendar: one page for admin, seller, stock keeper, delivery and
 * procurement. It shows what each module already schedules (deliveries,
 * freight, transfers, purchase orders, credit due dates), read live for the
 * range on screen, next to the calendar's own entries: reminders, bills,
 * shifts and meetings, once or repeating, each occurrence ticked off when
 * done or paid. Backend: App\Http\Controllers\Shared\CalendarController.
 */
export default function CalendarIndex({ app, sources = [], starters = [], initialDate = null, scopeLabel, readerEnabled = false, pendingDocument = null }: Props) {
    const storageKey = `duka.calendar.${app}`;
    const [date, setDate] = React.useState<Date>(() => (initialDate ? parseDay(initialDate) : new Date()));
    const [view, setView] = React.useState<View>(() =>
        [readStored<unknown>(`${storageKey}.view`, null)].find(isView) ?? (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? Views.AGENDA : Views.MONTH),
    );
    const [hidden, setHidden] = React.useState<string[]>(() => readStored<string[]>(`${storageKey}.hidden`, []));
    const [events, setEvents] = React.useState<CalendarEventData[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [failed, setFailed] = React.useState(false);
    const [version, setVersion] = React.useState(0);
    const [selected, setSelected] = React.useState<CalendarEventData | null>(null);
    const [formTarget, setFormTarget] = React.useState<EntryFormTarget | null>(null);
    const [starting, setStarting] = React.useState<NewFromDayTarget | null>(null);
    const [uploading, setUploading] = React.useState(false);
    const [reviewing, setReviewing] = React.useState<PendingDocument | null>(pendingDocument);

    // A finished upload comes back with ?document=: open its review.
    React.useEffect(() => setReviewing(pendingDocument), [pendingDocument?.id]);
    React.useEffect(() => {
        if (initialDate) setDate(parseDay(initialDate));
    }, [initialDate]);

    const sourceByKey = React.useMemo(() => Object.fromEntries(sources.map((s) => [s.key, s])), [sources]);
    const range = React.useMemo(() => rangeFor(view, date), [view, date]);
    const from = format(range.from, "yyyy-MM-dd");
    const to = format(range.to, "yyyy-MM-dd");
    const reload = React.useCallback(() => setVersion((v) => v + 1), []);

    React.useEffect(() => store(`${storageKey}.view`, view), [storageKey, view]);
    React.useEffect(() => store(`${storageKey}.hidden`, hidden), [storageKey, hidden]);

    React.useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setFailed(false);

        fetch(route(calendarRoute(app, "feed"), { from, to }), {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.json() as Promise<{ events: CalendarEventData[] }>;
            })
            .then((payload) => setEvents(payload.events ?? []))
            .catch((error: unknown) => {
                if ((error as Error).name !== "AbortError") setFailed(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [app, from, to, version]);

    const shown = React.useMemo(() => events.filter((e) => !hidden.includes(e.source)).map(toCalEvent), [events, hidden]);

    const counts = React.useMemo(() => {
        const c: Record<string, number> = {};
        for (const e of events) c[e.source] = (c[e.source] ?? 0) + 1;
        return c;
    }, [events]);

    const late = events.filter((e) => e.state === "late" && !hidden.includes(e.source)).length;

    const toggle = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

    const eventPropGetter = React.useCallback(
        (e: CalEvent) => ({ className: `tone-${sourceByKey[e.resource.source]?.tone ?? "primary"} state-${e.resource.state}` }),
        [sourceByKey],
    );

    // A note straight away when there is nothing else to start; otherwise ask what.
    const addOn = (target: NewFromDayTarget) => {
        if (starters.length === 0) setFormTarget({ mode: "create", ...target });
        else setStarting(target);
    };

    const onSelectSlot = (slot: SlotInfo) => {
        const allDay = view === Views.MONTH || slot.slots.length <= 1 && slot.start.getHours() === 0 && slot.start.getMinutes() === 0;
        addOn({ start: slot.start, end: allDay ? undefined : slot.end, allDay });
    };

    const components = React.useMemo(
        () => ({
            event: ({ event }: { event: CalEvent }) => <EventChip event={event} />,
            agenda: { event: ({ event }: { event: CalEvent }) => <AgendaRow event={event} tone={sourceByKey[event.resource.source]?.tone ?? "primary"} /> },
        }),
        [sourceByKey],
    );

    return (
        <>
            <Head title="Calendar" />
            {app === "delivery" ? <FlashToast /> : null}

            <div className="mx-auto w-full max-w-[1400px] px-3 py-3 sm:px-6 lg:py-4">
                <CalendarHeader
                    scopeLabel={scopeLabel}
                    view={view}
                    date={date}
                    loading={loading}
                    late={late}
                    sources={sources}
                    hidden={hidden}
                    counts={counts}
                    onToggleSource={toggle}
                    onNavigate={setDate}
                    onView={setView}
                    onUpload={() => setUploading(true)}
                    onAdd={() => addOn({ start: new Date(), allDay: true })}
                />

                {failed ? (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-[14px] border border-error/40 bg-error-container/50 px-4 py-2.5 text-[13px] font-bold text-on-error-container">
                        The calendar could not load these dates.
                        <button type="button" onClick={reload} className="underline">Try again</button>
                    </div>
                ) : null}

                <div className="duka-calendar h-[calc(100dvh-190px)] min-h-[520px]">
                    <Calendar<CalEvent, object>
                        localizer={localizer}
                        culture="en-US"
                        events={shown}
                        date={date}
                        view={view}
                        views={VIEW_OPTIONS.map((v) => v.value)}
                        onNavigate={setDate}
                        onView={setView}
                        length={AGENDA_DAYS}
                        toolbar={false}
                        selectable
                        popup
                        onSelectSlot={onSelectSlot}
                        onSelectEvent={(e) => setSelected(e.resource)}
                        eventPropGetter={eventPropGetter}
                        components={components}
                        scrollToTime={new Date(1970, 0, 1, 7, 0)}
                        messages={{ agenda: "List", noEventsInRange: "Nothing on the calendar for these dates.", showMore: (n) => `+${n} more` }}
                    />
                </div>
            </div>

            <EventDetails
                app={app}
                event={selected}
                source={selected ? sourceByKey[selected.source] : undefined}
                onClose={() => setSelected(null)}
                onEdit={(e) => {
                    setSelected(null);
                    setFormTarget({ mode: "edit", event: e });
                }}
                onChanged={reload}
            />

            <NewFromDay
                target={starting}
                starters={starters}
                onClose={() => setStarting(null)}
                onNote={(target) => {
                    setStarting(null);
                    setFormTarget({ mode: "create", ...target });
                }}
            />

            <EntryForm app={app} scopeLabel={scopeLabel} target={formTarget} onClose={() => setFormTarget(null)} onSaved={reload} />

            <ReceiptUpload app={app} open={uploading} readerEnabled={readerEnabled} onClose={() => setUploading(false)} />
            <ReceiptReview
                app={app}
                scopeLabel={scopeLabel}
                document={reviewing}
                onClose={() => {
                    setReviewing(null);
                    reload();
                    // "Not now": drop ?document= so a refresh doesn't reopen it (after adding, the redirect already did).
                    if (new URLSearchParams(window.location.search).has("document")) {
                        router.get(route(calendarRoute(app, "")), {}, { replace: true, preserveState: true, preserveScroll: true });
                    }
                }}
            />
        </>
    );
}

/** One event in the month, week and day grids. */
function EventChip({ event }: { event: CalEvent }) {
    const e = event.resource;
    return (
        <span className="flex min-w-0 items-center gap-1">
            <span className="material-symbols-outlined shrink-0 text-[13px]">{e.state === "done" ? "check_circle" : (KIND_ICON[e.kind] ?? "event")}</span>
            <span className="truncate">{e.title}</span>
        </span>
    );
}

/** One row of the List view. */
function AgendaRow({ event, tone }: { event: CalEvent; tone: string }) {
    const e = event.resource;
    return (
        <span className={`tone-${tone} flex min-w-0 items-start gap-2`}>
            <span className="duka-agenda-dot mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[999px]" />
            <span className="min-w-0">
                <span className={`block font-bold ${e.state === "done" ? "line-through opacity-60" : ""}`}>
                    {e.title}
                    {e.state === "late" ? <span className="ml-2 text-[12px] font-extrabold text-error">Late</span> : null}
                </span>
                {e.subtitle || e.amount !== null ? (
                    <span className="block text-[12px] text-on-surface-variant">
                        {[e.subtitle, e.amount !== null ? money(e.amount, e.currency) : null].filter(Boolean).join(" · ")}
                    </span>
                ) : null}
            </span>
        </span>
    );
}

const LAYOUTS: Record<CalendarApp, React.ComponentType<{ children: React.ReactNode }>> = {
    admin: ({ children }) => <AdminLayout flashToast>{children}</AdminLayout>,
    seller: SellerLayout,
    stock_keeper: StockKeeperLayout,
    delivery: DeliveryLayout,
    procurement: ProcurementLayout,
};

CalendarIndex.layout = (page: React.ReactElement<Props>) => {
    const Layout = LAYOUTS[page.props.app] ?? LAYOUTS.admin;
    return <Layout>{page}</Layout>;
};
