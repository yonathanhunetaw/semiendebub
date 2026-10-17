import { dayDateTime } from "@/utils/dates";
import type { CustodyKeyView, WorkApp } from "@/types/work";
import { router } from "@inertiajs/react";
import React, { useState } from "react";
import { cardCls, ghostBtn, HANDOVER_CHIP, inputCls, KIND_ICON, primaryBtn, REASON_LABEL, wr } from "./workUi";

interface Props {
    app: WorkApp;
    keyView: CustodyKeyView;
    reasons?: string[];
    /** Show the hand-over log (managers). */
    showLog?: boolean;
}

/**
 * One key: who holds it, the hand-over waiting, and what the viewer may do —
 * hand it over (the holder), cancel (giver or manager), give it directly
 * (manager, with a note). The holder changes only when the receiver accepts.
 */
export default function KeyCard({ app, keyView, reasons = [], showLog = false }: Props): React.ReactElement {
    const [mode, setMode] = useState<"hand" | "force" | null>(null);
    const [toId, setToId] = useState<string>("");
    const [reason, setReason] = useState<string>("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const receivers = keyView.receivers ?? [];

    const submit = () => {
        if (!toId) return;
        setBusy(true);
        const url =
            mode === "force" ? wr(app, "work.keys.force", keyView.id) : wr(app, "work.keys.hand-over", keyView.id);
        router.post(
            url,
            mode === "force" ? { to_id: Number(toId), note } : { to_id: Number(toId), reason: reason || null, note: note || null },
            {
                preserveScroll: true,
                onFinish: () => setBusy(false),
                onSuccess: () => {
                    setMode(null);
                    setToId("");
                    setNote("");
                },
            },
        );
    };

    const cancel = () => {
        if (!keyView.pending) return;
        router.post(wr(app, "work.key-handovers.cancel", keyView.pending.id), {}, { preserveScroll: true });
    };

    return (
        <section className={cardCls}>
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-container text-on-primary-container">
                    <span className="material-symbols-outlined text-[22px]">{KIND_ICON[keyView.kind] ?? "key"}</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-on-surface">{keyView.label}</p>
                    <p className="text-[11px] text-on-surface-variant">
                        {keyView.holder ? (
                            <>
                                Held by <span className="font-semibold text-on-surface">{keyView.holder.name}</span>
                                {keyView.held_since ? ` since ${dayDateTime(keyView.held_since, "")}` : ""}
                            </>
                        ) : (
                            "Nobody holds it yet"
                        )}
                    </p>
                </div>
            </div>

            {keyView.pending ? (
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] border border-info/30 bg-info-container/50 px-2.5 py-2">
                    <p className="text-[11px] text-on-info-container">
                        Handed to <span className="font-bold">{keyView.pending.to?.name}</span>, waiting for them to accept.
                    </p>
                    {keyView.can.cancel ? (
                        <button type="button" onClick={cancel} className="shrink-0 text-[11px] font-bold text-primary">
                            Cancel
                        </button>
                    ) : null}
                </div>
            ) : null}

            {mode !== null ? (
                <div className="mt-3 space-y-2">
                    <select className={inputCls} value={toId} onChange={(e) => setToId(e.target.value)}>
                        <option value="">{mode === "force" ? "Give the key to…" : "Hand it to…"}</option>
                        {receivers.map((person) => (
                            <option key={person.id} value={person.id}>
                                {person.name}
                            </option>
                        ))}
                    </select>
                    {mode === "hand" && reasons.length > 0 ? (
                        <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                            <option value="">Why (optional)</option>
                            {reasons.map((r) => (
                                <option key={r} value={r}>
                                    {REASON_LABEL[r] ?? r}
                                </option>
                            ))}
                        </select>
                    ) : null}
                    <input
                        className={inputCls}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={mode === "force" ? "Why without the holder? (required)" : "Note (optional)"}
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={primaryBtn}
                            disabled={busy || !toId || (mode === "force" && note.trim() === "")}
                            onClick={submit}
                        >
                            {mode === "force" ? "Give key" : "Hand over"}
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setMode(null)}>
                            Back
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                    {keyView.can.hand_over ? (
                        <button type="button" className={primaryBtn} onClick={() => setMode("hand")}>
                            Hand over
                        </button>
                    ) : null}
                    {keyView.can.force ? (
                        <button type="button" className={ghostBtn} onClick={() => setMode("force")}>
                            {keyView.holder ? "Give to someone" : "Give the key"}
                        </button>
                    ) : null}
                </div>
            )}

            {showLog && keyView.log.length > 0 ? (
                <ul className="mt-3 divide-y divide-outline-variant/40 border-t border-outline-variant/40">
                    {keyView.log.map((row) => (
                        <li key={row.id} className="flex items-start justify-between gap-2 py-2">
                            <div className="min-w-0">
                                <p className="text-[12px] text-on-surface">
                                    {row.from?.name ?? "Nobody"} → <span className="font-semibold">{row.to?.name}</span>
                                    {row.reason ? <span className="text-on-surface-variant"> · {REASON_LABEL[row.reason] ?? row.reason}</span> : null}
                                </p>
                                <p className="text-[11px] text-on-surface-variant">
                                    {dayDateTime(row.at, "")}
                                    {row.status === "forced" && row.by ? ` · by ${row.by.name}` : ""}
                                    {row.note ? ` · ${row.note}` : ""}
                                </p>
                            </div>
                            <span
                                className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold ${HANDOVER_CHIP[row.status].className}`}
                            >
                                {HANDOVER_CHIP[row.status].label}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
