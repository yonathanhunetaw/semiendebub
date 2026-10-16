import React from "react";
import { useForm } from "@inertiajs/react";
import { format } from "date-fns";
import { SkButton, SkField, SkSheet, inputClass } from "@/Components/StockKeeper/skKit";
import { REPEAT_UNIT, calendarRoute } from "@/Components/Calendar/calendarUi";
import type { EntryRepeat, EntryVisibility, PendingDocument } from "@/types/calendar";

/**
 * Upload a receipt or bill from the calendar. The server keeps the file, asks
 * the reader what it is, and comes back to the calendar with `?document=`,
 * which opens ReceiptReview.
 */
export function ReceiptUpload({ app, open, readerEnabled, onClose }: { app: string; open: boolean; readerEnabled: boolean; onClose: () => void }) {
    const form = useForm<{ file: File | null }>({ file: null });

    React.useEffect(() => {
        if (!open) form.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(route(calendarRoute(app, "documents.store")), { forceFormData: true, onSuccess: onClose });
    };

    return (
        <SkSheet
            open={open}
            onClose={form.processing ? () => undefined : onClose}
            title="Upload a receipt or bill"
            subtitle={readerEnabled ? "It is read for you: what was paid, to whom, when, and whether it comes back every month." : "You will fill in what it is on the next screen."}
            footer={
                <>
                    <SkButton variant="ghost" onClick={onClose} disabled={form.processing}>Cancel</SkButton>
                    <SkButton type="submit" form="receipt-upload-form" icon={form.processing ? "progress_activity" : "upload"} disabled={!form.data.file || form.processing}>
                        {form.processing ? (readerEnabled ? "Reading it…" : "Uploading…") : "Upload"}
                    </SkButton>
                </>
            }
        >
            <form id="receipt-upload-form" onSubmit={submit} className="space-y-3 pt-1">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-center hover:border-primary">
                    <span className="material-symbols-outlined text-[36px] text-primary">{form.data.file ? "description" : "add_a_photo"}</span>
                    <span className="text-[14px] font-bold text-on-surface">{form.data.file ? form.data.file.name : "Take a photo or choose a file"}</span>
                    <span className="text-[12px] text-on-surface-variant">JPG, PNG, WEBP or PDF, up to 10 MB</span>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                        className="sr-only"
                        aria-label="Receipt or bill"
                        onChange={(e) => form.setData("file", e.target.files?.[0] ?? null)}
                    />
                </label>
                {form.errors.file ? <p className="text-[13px] font-bold text-error">{form.errors.file}</p> : null}
                {readerEnabled ? (
                    <p className="text-[12px] text-on-surface-variant">The file is sent to Claude (Anthropic) to be read. Nothing goes on the calendar until you check it.</p>
                ) : null}
            </form>
        </SkSheet>
    );
}

interface ReviewData {
    title: string;
    paid: boolean;
    date: string;
    amount: string;
    currency: string;
    counterparty: string;
    repeat: EntryRepeat;
    repeat_every: number;
    visibility: EntryVisibility;
    notes: string;
}

function fromDocument(doc: PendingDocument): ReviewData {
    const r = doc.reading;
    return {
        title: r?.title ?? "",
        paid: r ? r.is_paid || r.kind === "receipt" : true,
        date: r?.date ?? format(new Date(), "yyyy-MM-dd"),
        amount: r?.amount !== null && r?.amount !== undefined ? String(r.amount) : "",
        currency: r?.currency ?? "ETB",
        counterparty: r?.payee ?? "",
        repeat: r?.recurring ? r.repeat : "none",
        repeat_every: r?.repeat_every ?? 1,
        visibility: "shared",
        notes: "",
    };
}

/**
 * Check what the reader made of an upload (or fill it in when there is no
 * reader), then put it on the calendar: paid on its day, due again if it repeats.
 */
export function ReceiptReview({ app, scopeLabel, document, onClose }: { app: string; scopeLabel: string; document: PendingDocument | null; onClose: () => void }) {
    const form = useForm<ReviewData>(document ? fromDocument(document) : fromDocument({ id: 0, name: "", is_image: false, url: "", status: "unread", reading: null, read_error: null }));

    React.useEffect(() => {
        if (document) form.setData(fromDocument(document));
        form.clearErrors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [document?.id]);

    if (!document) return null;

    const r = document.reading;
    const unit = form.data.repeat !== "none" ? REPEAT_UNIT[form.data.repeat] : null;
    const err = form.errors as Partial<Record<string, string>>;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({
            ...d,
            amount: d.amount === "" ? null : d.amount,
            currency: d.amount === "" ? null : d.currency,
            counterparty: d.counterparty || null,
            notes: d.notes || null,
            repeat_every: d.repeat === "none" ? 1 : d.repeat_every,
        }));
        form.post(route(calendarRoute(app, "documents.add"), document.id), { onSuccess: onClose });
    };

    return (
        <SkSheet
            open
            onClose={onClose}
            wide
            title={r ? "Is this right?" : "What is this document?"}
            subtitle={r?.summary || document.name}
            footer={
                <>
                    <SkButton variant="ghost" onClick={onClose}>Not now</SkButton>
                    <SkButton type="submit" form="receipt-review-form" icon="event_available" disabled={form.processing}>
                        {form.data.paid ? (form.data.repeat !== "none" ? "Add as paid, and the next one" : "Add as paid") : "Add as due"}
                    </SkButton>
                </>
            }
        >
            <div className="grid gap-4 pt-1 sm:grid-cols-[180px_1fr]">
                <a href={document.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[14px] border border-outline-variant bg-surface-container-low">
                    {document.is_image ? (
                        <img src={document.url} alt={document.name} className="h-48 w-full object-cover sm:h-full sm:max-h-80" />
                    ) : (
                        <span className="flex h-32 flex-col items-center justify-center gap-1 text-[13px] font-bold text-primary">
                            <span className="material-symbols-outlined text-[32px]">picture_as_pdf</span>
                            Open the PDF
                        </span>
                    )}
                </a>

                <form id="receipt-review-form" onSubmit={submit} className="space-y-3">
                    {document.status === "failed" ? (
                        <p className="rounded-[12px] bg-error-container/60 px-3 py-2 text-[13px] font-bold text-on-error-container">{document.read_error ?? "It could not be read."} Fill it in below.</p>
                    ) : document.status === "unread" ? (
                        <p className="rounded-[12px] bg-surface-container px-3 py-2 text-[13px] text-on-surface-variant">Reading documents is not set up, so fill it in below.</p>
                    ) : r?.kind === "other" ? (
                        <p className="rounded-[12px] bg-warning-container/60 px-3 py-2 text-[13px] font-bold text-on-warning-container">This does not look like a receipt or a bill. Check before adding it.</p>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2">
                        {[true, false].map((paid) => {
                            const on = form.data.paid === paid;
                            return (
                                <button
                                    key={String(paid)}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => form.setData("paid", paid)}
                                    className={`flex items-center justify-center gap-1.5 rounded-[12px] border px-3 py-2 text-[13px] font-bold ${
                                        on ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant hover:border-primary"
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{paid ? "task_alt" : "schedule"}</span>
                                    {paid ? "Already paid" : "Still to pay"}
                                </button>
                            );
                        })}
                    </div>

                    <SkField label="Title" error={err.title}>
                        <input value={form.data.title} onChange={(e) => form.setData("title", e.target.value)} className={inputClass} maxLength={160} required />
                    </SkField>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <SkField label={form.data.paid ? "Paid on" : "Due on"} error={err.date} hint={r?.date_as_printed && r.date_as_printed !== r.date ? `Printed as ${r.date_as_printed}` : undefined}>
                            <input type="date" value={form.data.date} onChange={(e) => form.setData("date", e.target.value)} className={inputClass} required />
                        </SkField>
                        <SkField label="Paid to" error={err.counterparty}>
                            <input value={form.data.counterparty} onChange={(e) => form.setData("counterparty", e.target.value)} className={inputClass} maxLength={160} />
                        </SkField>
                    </div>

                    <div className="grid grid-cols-[1fr_96px] gap-3">
                        <SkField label="Amount" error={err.amount}>
                            <input type="number" min={0} step="0.01" inputMode="decimal" value={form.data.amount} onChange={(e) => form.setData("amount", e.target.value)} className={inputClass} />
                        </SkField>
                        <SkField label="Currency" error={err.currency}>
                            <input value={form.data.currency} maxLength={3} onChange={(e) => form.setData("currency", e.target.value.toUpperCase())} className={`${inputClass} uppercase`} />
                        </SkField>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <SkField label="Comes back" error={err.repeat}>
                            <select value={form.data.repeat} onChange={(e) => form.setData("repeat", e.target.value as EntryRepeat)} className={inputClass}>
                                <option value="none">No, just this once</option>
                                <option value="weekly">Every week</option>
                                <option value="monthly">Every month</option>
                                <option value="yearly">Every year</option>
                            </select>
                        </SkField>
                        {unit ? (
                            <SkField label={`Every how many ${unit[1]}`} error={err.repeat_every}>
                                <input type="number" min={1} max={365} value={form.data.repeat_every} onChange={(e) => form.setData("repeat_every", Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                            </SkField>
                        ) : null}
                    </div>

                    <SkField label="Who sees it" error={err.visibility}>
                        <select value={form.data.visibility} onChange={(e) => form.setData("visibility", e.target.value as EntryVisibility)} className={inputClass}>
                            <option value="shared">Everyone at {scopeLabel}</option>
                            <option value="private">Only me</option>
                        </select>
                    </SkField>

                    <p className="text-[12px] text-on-surface-variant">A note on the calendar, not a payment: money still goes through Payments.</p>
                </form>
            </div>
        </SkSheet>
    );
}
