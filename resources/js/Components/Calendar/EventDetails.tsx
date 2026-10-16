import React from "react";
import { router } from "@inertiajs/react";
import { format, parseISO } from "date-fns";
import { SkButton, SkSheet } from "@/Components/StockKeeper/skKit";
import { TONES } from "@/Components/Shared/ui";
import { KIND_ICON, KIND_LABEL, STATE_LABEL, calendarRoute, money, repeatLabel, sameHost, whenLabel } from "@/Components/Calendar/calendarUi";
import type { CalendarEventData, CalendarSourceInfo, EntryKind } from "@/types/calendar";

interface Props {
    app: string;
    event: CalendarEventData | null;
    source: CalendarSourceInfo | undefined;
    onClose: () => void;
    onEdit: (event: CalendarEventData) => void;
    onChanged: () => void;
}

const STATE_PILL: Record<string, string> = {
    upcoming: TONES.info.pill,
    done: TONES.success.pill,
    late: TONES.error.pill,
    past: "bg-surface-container text-on-surface-variant",
};

/**
 * One event, opened from the calendar: what and when, a link to the module
 * page it comes from, and, for the calendar's own entries, tick off this
 * occurrence, edit or delete.
 */
export default function EventDetails({ app, event, source, onClose, onEdit, onChanged }: Props) {
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => setConfirmDelete(false), [event]);

    if (!event) return <SkSheet open={false} onClose={onClose} title="">{null}</SkSheet>;

    const entry = event.entry;
    const isBill = event.kind === "bill";
    const repeat = entry ? repeatLabel(entry.repeat, entry.repeat_every, entry.repeat_until) : null;
    const tone = TONES[source?.tone ?? "primary"];

    const done = () => {
        if (!entry) return;
        setBusy(true);
        router.post(
            route(calendarRoute(app, "entries.complete"), entry.id),
            { occurs_on: entry.occurs_on, done: entry.completion === null },
            { preserveScroll: true, preserveState: true, onSuccess: () => { onChanged(); onClose(); }, onFinish: () => setBusy(false) },
        );
    };

    const remove = () => {
        if (!entry) return;
        setBusy(true);
        router.delete(route(calendarRoute(app, "entries.destroy"), entry.id), {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => { onChanged(); onClose(); },
            onFinish: () => setBusy(false),
        });
    };

    const open = () => {
        if (!event.url) return;
        if (sameHost(event.url)) router.visit(event.url);
        else window.location.href = event.url;
    };

    return (
        <SkSheet
            open
            onClose={onClose}
            title={event.title}
            subtitle={whenLabel(event)}
            footer={
                entry ? (
                    <>
                        {entry.can_edit ? (
                            confirmDelete ? (
                                <SkButton variant="danger" icon="delete_forever" onClick={remove} disabled={busy}>
                                    {entry.repeat !== "none" ? "Delete every occurrence" : "Yes, delete"}
                                </SkButton>
                            ) : (
                                <SkButton variant="danger" icon="delete" onClick={() => setConfirmDelete(true)}>Delete</SkButton>
                            )
                        ) : null}
                        {entry.can_edit ? <SkButton variant="outline" icon="edit" onClick={() => onEdit(event)}>Edit</SkButton> : null}
                        <SkButton variant={entry.completion ? "outline" : "success"} icon={entry.completion ? "undo" : "check_circle"} onClick={done} disabled={busy}>
                            {entry.completion ? "Reopen" : isBill ? "Mark paid" : "Mark done"}
                        </SkButton>
                    </>
                ) : event.url ? (
                    <SkButton icon="open_in_new" onClick={open}>Open</SkButton>
                ) : undefined
            }
        >
            <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-[999px] px-2.5 py-1 text-[12px] font-bold ${tone.pill}`}>
                        <span className="material-symbols-outlined text-[16px]">{KIND_ICON[event.kind] ?? "event"}</span>
                        {entry ? KIND_LABEL[event.kind as EntryKind] ?? event.kind : source?.label}
                    </span>
                    <span className={`rounded-[999px] px-2.5 py-1 text-[12px] font-bold ${STATE_PILL[event.state]}`}>
                        {event.state === "done" && isBill ? "Paid" : STATE_LABEL[event.state]}
                    </span>
                    {event.status && !entry ? <span className="text-[12px] font-bold text-on-surface-variant">{event.status.replace(/_/g, " ")}</span> : null}
                </div>

                {event.amount !== null ? (
                    <p className="text-[26px] font-extrabold tabular-nums text-on-surface">{money(event.amount, event.currency)}</p>
                ) : null}

                <dl className="space-y-2 text-[14px]">
                    {event.subtitle ? <Row icon={isBill ? "storefront" : "info"} label={isBill ? "Paid to" : "Details"}>{event.subtitle}</Row> : null}
                    {repeat ? <Row icon="repeat" label="Repeats">{repeat}</Row> : null}
                    {entry?.completion ? (
                        <Row icon="task_alt" label={isBill ? "Paid" : "Done"}>
                            {format(parseISO(entry.completion.at), "d MMM yyyy, HH:mm")}
                            {entry.completion.by ? ` by ${entry.completion.by}` : ""}
                        </Row>
                    ) : null}
                    {entry ? (
                        <Row icon={entry.visibility === "shared" ? "group" : "lock"} label="Who sees it">
                            {entry.visibility === "shared" ? (entry.store ? `Everyone at ${entry.store}` : "Everyone") : "Only you"}
                            {entry.created_by ? ` · added by ${entry.created_by}` : ""}
                        </Row>
                    ) : null}
                </dl>

                {entry?.notes ? <p className="whitespace-pre-line rounded-[14px] bg-surface-container-low p-3 text-[14px] text-on-surface">{entry.notes}</p> : null}

                {entry?.document_url ? (
                    <a href={entry.document_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-bold text-primary">
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        See the receipt
                    </a>
                ) : null}

                {entry && event.url ? (
                    <button type="button" onClick={open} className="text-[13px] font-bold text-primary">Open the record it came from</button>
                ) : null}
            </div>
        </SkSheet>
    );
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <span className="material-symbols-outlined mt-0.5 text-[18px] text-on-surface-variant">{icon}</span>
            <dt className="sr-only">{label}</dt>
            <dd className="min-w-0 text-on-surface">{children}</dd>
        </div>
    );
}
