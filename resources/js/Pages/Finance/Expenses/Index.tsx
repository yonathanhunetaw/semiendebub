import { useBusy } from "@/hooks/useBusy";
import FlashToast from "@/Components/Shared/FlashToast";
import { cardCls, ghostBtn, inputCls, primaryBtn, sectionTitle } from "@/Components/Work/workUi";
import AdminLayout from "@/Layouts/AdminLayout";
import FinanceLayout from "@/Layouts/FinanceLayout";
import { dayDate } from "@/utils/dates";
import { Head, router, useForm } from "@inertiajs/react";
import React, { useState } from "react";

/**
 * Expenses: money that went out (fuel for staff rides, rent, salaries…).
 * Anyone here records one; it counts once a second person (finance or a
 * global admin) confirms it. The same page on the finance app and the admin
 * app's global zone (ExpenseController).
 */

interface ExpenseRow {
    id: number;
    category: string;
    amount: number;
    currency: string;
    spent_on: string;
    description: string | null;
    store: string | null;
    vehicle: string | null;
    litres: number | null;
    ride_id: number | null;
    status: "claimed" | "confirmed" | "rejected";
    recorded_by: string | null;
    decided_by: string | null;
    reject_reason: string | null;
    receipt_url: string | null;
    can_decide: boolean;
}

interface Props {
    app: "finance" | "admin";
    waiting?: ExpenseRow[];
    recent?: ExpenseRow[];
    thisMonth?: Record<string, number>;
    lastMonth?: Record<string, number>;
    categories?: string[];
    stores?: { id: number; name: string }[];
    vehicles?: { id: number; name: string }[];
    mayConfirm: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
    fuel: "Fuel",
    rent: "Rent",
    salaries: "Salaries",
    utilities: "Utilities",
    maintenance: "Maintenance",
    tax: "Tax",
    other: "Other",
};

const birr = (n: number): string => `ETB ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (totals: Record<string, number>): number => Object.values(totals).reduce((a, b) => a + b, 0);

function Row({ app, row }: { app: Props["app"]; row: ExpenseRow }): React.ReactElement {
    const [rejecting, setRejecting] = useState(false);
    const { busy, post } = useBusy();
    const [reason, setReason] = useState("");

    return (
        <li className="py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-on-surface">
                        {CATEGORY_LABEL[row.category] ?? row.category} · {birr(row.amount)}
                        {row.litres ? ` · ${row.litres} L` : ""}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                        {dayDate(row.spent_on)}
                        {row.description ? ` · ${row.description}` : ""}
                        {row.store ? ` · ${row.store}` : ""}
                        {row.vehicle ? ` · ${row.vehicle}` : ""}
                        {row.recorded_by ? ` · by ${row.recorded_by}` : ""}
                        {row.decided_by ? ` · ${row.status === "confirmed" ? "confirmed" : "rejected"} by ${row.decided_by}` : ""}
                        {row.reject_reason ? ` (“${row.reject_reason}”)` : ""}
                    </p>
                </div>
                {row.receipt_url ? (
                    <a href={row.receipt_url} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] font-bold text-primary">
                        Receipt
                    </a>
                ) : null}
            </div>
            {row.can_decide ? (
                rejecting ? (
                    <div className="mt-2 flex gap-2">
                        <input className={inputCls} placeholder="Why it does not count" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button
                            type="button"
                            className={primaryBtn}
                            disabled={busy || reason.trim() === ""}
                            onClick={() => post(route(`${app}.expenses.reject`, row.id), { reason }, { preserveScroll: true })}
                        >
                            Reject
                        </button>
                    </div>
                ) : (
                    <div className="mt-2 flex gap-2">
                        <button type="button" className={primaryBtn} disabled={busy} onClick={() => post(route(`${app}.expenses.confirm`, row.id), {}, { preserveScroll: true })}>
                            Confirm
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setRejecting(true)}>
                            Reject
                        </button>
                    </div>
                )
            ) : row.status === "claimed" ? (
                <p className="mt-1 text-[11px] text-on-surface-variant">Waiting for a second person.</p>
            ) : null}
        </li>
    );
}

export default function ExpensesIndex({
    app,
    waiting = [],
    recent = [],
    thisMonth = {},
    lastMonth = {},
    categories = [],
    stores = [],
    vehicles = [],
}: Props): React.ReactElement {
    const form = useForm<{
        category: string;
        amount: string;
        spent_on: string;
        description: string;
        store_id: string;
        vehicle_id: string;
        litres: string;
        receipt: File | null;
    }>({ category: "fuel", amount: "", spent_on: new Date().toISOString().slice(0, 10), description: "", store_id: "", vehicle_id: "", litres: "", receipt: null });

    return (
        <>
            <Head title="Expenses" />

            <div className="mx-auto max-w-3xl space-y-3 px-3.5 pb-24 pt-3">
                <header>
                    <h1 className="text-lg font-bold tracking-tight text-on-surface">Expenses</h1>
                    <p className="text-[11px] text-outline">Fuel for staff rides, rent, salaries… An expense counts once a second person confirms it.</p>
                </header>

                <section className={`${cardCls} grid grid-cols-2 gap-3`}>
                    {[
                        ["This month", thisMonth],
                        ["Last month", lastMonth],
                    ].map(([label, totals]) => (
                        <div key={label as string}>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label as string}</p>
                            <p className="text-[18px] font-extrabold text-on-surface">{birr(sum(totals as Record<string, number>))}</p>
                            <ul className="mt-1 space-y-0.5">
                                {Object.entries(totals as Record<string, number>).map(([category, total]) => (
                                    <li key={category} className="flex justify-between text-[11px] text-on-surface-variant">
                                        <span>{CATEGORY_LABEL[category] ?? category}</span>
                                        <span>{birr(total)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </section>

                <h2 className={sectionTitle}>Waiting for a second person</h2>
                <section className={cardCls}>
                    {waiting.length === 0 ? <p className="text-[12px] text-on-surface-variant">Nothing waiting.</p> : null}
                    <ul className="divide-y divide-outline-variant/40">
                        {waiting.map((row) => (
                            <Row key={row.id} app={app} row={row} />
                        ))}
                    </ul>
                </section>

                <h2 className={sectionTitle}>Record an expense</h2>
                <form
                    className={`${cardCls} grid grid-cols-2 gap-2`}
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post(route(`${app}.expenses.store`), { preserveScroll: true, forceFormData: true, onSuccess: () => form.reset() });
                    }}
                >
                    <select className={inputCls} value={form.data.category} onChange={(e) => form.setData("category", e.target.value)}>
                        {categories.map((c) => (
                            <option key={c} value={c}>
                                {CATEGORY_LABEL[c] ?? c}
                            </option>
                        ))}
                    </select>
                    <input className={inputCls} inputMode="decimal" placeholder="Amount (ETB)" value={form.data.amount} onChange={(e) => form.setData("amount", e.target.value)} required />
                    <input type="date" className={inputCls} value={form.data.spent_on} onChange={(e) => form.setData("spent_on", e.target.value)} required />
                    <select className={inputCls} value={form.data.store_id} onChange={(e) => form.setData("store_id", e.target.value)}>
                        <option value="">No store (company)</option>
                        {stores.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                    {form.data.category === "fuel" || form.data.category === "maintenance" ? (
                        <>
                            <select className={inputCls} value={form.data.vehicle_id} onChange={(e) => form.setData("vehicle_id", e.target.value)}>
                                <option value="">Which car…</option>
                                {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.name}
                                    </option>
                                ))}
                            </select>
                            <input className={inputCls} inputMode="decimal" placeholder="Litres (optional)" value={form.data.litres} onChange={(e) => form.setData("litres", e.target.value)} />
                        </>
                    ) : null}
                    <input className={`${inputCls} col-span-2`} placeholder="What for" value={form.data.description} onChange={(e) => form.setData("description", e.target.value)} />
                    <label className="col-span-2 text-[11px] text-on-surface-variant">
                        Receipt photo (optional)
                        <input type="file" accept="image/*,application/pdf" className="mt-1 block text-[12px]" onChange={(e) => form.setData("receipt", e.target.files?.[0] ?? null)} />
                    </label>
                    {Object.values(form.errors).map((m) => (
                        <p key={m} className="col-span-2 text-[11px] text-error">
                            {m}
                        </p>
                    ))}
                    <button type="submit" className={`col-span-2 ${primaryBtn}`} disabled={form.processing}>
                        Record
                    </button>
                </form>

                <h2 className={sectionTitle}>Recently decided</h2>
                <section className={cardCls}>
                    {recent.length === 0 ? <p className="text-[12px] text-on-surface-variant">Nothing yet.</p> : null}
                    <ul className="divide-y divide-outline-variant/40">
                        {recent.map((row) => (
                            <Row key={row.id} app={app} row={row} />
                        ))}
                    </ul>
                </section>
            </div>
            {app === "finance" ? <FlashToast bottomClass="bottom-6" /> : null}
        </>
    );
}

ExpensesIndex.layout = (page: React.ReactElement<Props>) =>
    page.props.app === "finance" ? <FinanceLayout>{page}</FinanceLayout> : <AdminLayout flashToast>{page}</AdminLayout>;
