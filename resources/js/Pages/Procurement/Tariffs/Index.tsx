import React from "react";
import { Head, Link, router, useForm } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState } from "@/Components/Shared/ui";
import { SkButton, SkField, SkHeader, SkPager, SkSearch, SkSheet, inputClass } from "@/Components/StockKeeper/skKit";
import type { Pagination, TariffRate, TariffRow } from "@/types/procurement";

interface Props {
    tariffs?: TariffRow[];
    filters: { search: string };
    pagination: Pagination;
}

const RATES: Array<{ key: TariffRate; label: string; short: string }> = [
    { key: "duty_pct", label: "Customs duty", short: "Duty" },
    { key: "excise_pct", label: "Excise", short: "Excise" },
    { key: "vat_pct", label: "VAT (claimed back)", short: "VAT" },
    { key: "surtax_pct", label: "Surtax", short: "Surtax" },
    { key: "withholding_pct", label: "Withholding (claimed back)", short: "WHT" },
    { key: "other_pct", label: "Other levies on CIF", short: "Other" },
];

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The government's import tax rates per HS code, as you keep them. Taxes
 * stack like customs does: duty on CIF, excise on CIF + duty, VAT on that,
 * surtax on that plus VAT, withholding on CIF.
 */
export default function ProcurementTariffs({ tariffs = [], filters, pagination }: Props) {
    const [search, setSearch] = React.useState(filters.search);
    const [editing, setEditing] = React.useState<TariffRow | "new" | null>(null);
    const [importing, setImporting] = React.useState(false);

    React.useEffect(() => {
        if (search === filters.search) return;
        const t = window.setTimeout(() => router.get(route("procurement.tariffs.index"), search ? { search } : {}, { preserveState: true, replace: true }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [search, filters.search]);

    return (
        <>
            <Head title="Tariffs" />
            <SkHeader
                title="Tariffs"
                subtitle="Import tax rates per HS code. Duty on the customs value (CIF), excise on CIF + duty, VAT on that, surtax on that plus VAT, withholding on CIF. VAT and withholding are claimed back, so they are not part of an item's cost."
                actions={
                    <span className="flex gap-2">
                        <Link href={route("procurement.costs.index")} className="self-center text-[14px] font-semibold text-primary">
                            Costs
                        </Link>
                        <SkButton variant="outline" icon="upload" onClick={() => setImporting(true)}>
                            Paste CSV
                        </SkButton>
                        <SkButton icon="add" onClick={() => setEditing("new")}>
                            Add
                        </SkButton>
                    </span>
                }
            />

            <div className="mb-3 sm:max-w-[360px]">
                <SkSearch value={search} onChange={setSearch} placeholder="HS code or description…" />
            </div>

            {tariffs.length === 0 ? (
                <EmptyState framed icon="gavel" title="No tariffs here" description="Add the HS codes of what you import, or paste the list as CSV." />
            ) : (
                <div className="overflow-x-auto rounded-[16px] border border-outline-variant bg-surface-container-lowest">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-outline-variant text-left text-on-surface-variant">
                                <th className="px-3 py-2 font-semibold">HS code</th>
                                <th className="px-3 py-2 font-semibold">Description</th>
                                {RATES.map((r) => (
                                    <th key={r.key} className="px-3 py-2 text-right font-semibold">
                                        {r.short} %
                                    </th>
                                ))}
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {tariffs.map((t) => (
                                <tr key={t.id} className="border-b border-outline-variant/60 last:border-0">
                                    <td className="px-3 py-2 font-mono font-bold">{t.hs_code}</td>
                                    <td className="px-3 py-2">{t.description}</td>
                                    {RATES.map((r) => (
                                        <td key={r.key} className="px-3 py-2 text-right">
                                            {t[r.key]}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2 text-right">
                                        <button type="button" className="font-semibold text-primary" onClick={() => setEditing(t)}>
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {pagination.last_page > 1 ? (
                <div className="mt-3">
                    <SkPager
                        page={pagination.current_page}
                        last={pagination.last_page}
                        total={pagination.total}
                        noun="HS codes"
                        onPage={(page) => router.get(route("procurement.tariffs.index"), { ...(filters.search ? { search: filters.search } : {}), page }, { preserveState: true })}
                    />
                </div>
            ) : null}

            <TariffSheet value={editing} onClose={() => setEditing(null)} />
            <ImportSheet open={importing} onClose={() => setImporting(false)} />
        </>
    );
}

function TariffSheet({ value, onClose }: { value: TariffRow | "new" | null; onClose: () => void }) {
    const existing = value !== null && value !== "new" ? value : null;
    const blank: Record<string, string> = { hs_code: "", description: "", effective_from: "", notes: "", ...Object.fromEntries(RATES.map((r) => [r.key, "0"])) };
    const form = useForm<Record<string, string>>(blank);

    React.useEffect(() => {
        if (value === null) return;
        form.clearErrors();
        form.setData(
            existing
                ? {
                      hs_code: existing.hs_code,
                      description: existing.description ?? "",
                      effective_from: existing.effective_from ?? "",
                      notes: existing.notes ?? "",
                      ...Object.fromEntries(RATES.map((r) => [r.key, String(existing[r.key])])),
                  }
                : blank,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (existing) form.put(route("procurement.tariffs.update", existing.id), options);
        else form.post(route("procurement.tariffs.store"), options);
    };

    return (
        <SkSheet
            open={value !== null}
            onClose={onClose}
            title={existing ? `HS ${existing.hs_code}` : "Add an HS code"}
            footer={
                <div className="flex justify-between gap-2">
                    {existing ? (
                        <SkButton variant="danger" onClick={() => router.delete(route("procurement.tariffs.destroy", existing.id), { preserveScroll: true, onSuccess: onClose })}>
                            Remove
                        </SkButton>
                    ) : (
                        <span />
                    )}
                    <span className="flex gap-2">
                        <SkButton variant="ghost" onClick={onClose}>
                            Cancel
                        </SkButton>
                        <SkButton type="submit" form="tariff-form" disabled={form.processing}>
                            Save
                        </SkButton>
                    </span>
                </div>
            }
        >
            <form id="tariff-form" onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <SkField label="HS code" error={form.errors.hs_code}>
                        <input className={inputClass} inputMode="numeric" value={form.data.hs_code} onChange={(e) => form.setData("hs_code", e.target.value)} placeholder="8523.51.00" />
                    </SkField>
                    <SkField label="In force from" error={form.errors.effective_from}>
                        <input className={inputClass} type="date" value={form.data.effective_from} onChange={(e) => form.setData("effective_from", e.target.value)} />
                    </SkField>
                </div>
                <SkField label="Description" error={form.errors.description}>
                    <input className={inputClass} value={form.data.description} onChange={(e) => form.setData("description", e.target.value)} placeholder="Flash memory cards and drives" />
                </SkField>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {RATES.map((r) => (
                        <SkField key={r.key} label={`${r.label} %`} error={form.errors[r.key]}>
                            <input className={inputClass} type="number" step="0.001" min={0} value={form.data[r.key]} onChange={(e) => form.setData(r.key, e.target.value)} />
                        </SkField>
                    ))}
                </div>
                <SkField label="Notes" error={form.errors.notes}>
                    <input className={inputClass} value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} />
                </SkField>
            </form>
        </SkSheet>
    );
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const form = useForm({ csv: "" });

    const loadFile = (file: File | undefined) => {
        if (!file) return;
        file.text().then((text) => form.setData("csv", text));
    };

    return (
        <SkSheet
            open={open}
            onClose={onClose}
            wide
            title="Paste tariffs as CSV"
            subtitle="One HS code a line: hs_code, description, duty, excise, vat, surtax, withholding, other (percentages). A header line is skipped; a code already in the table is replaced. If any line is wrong, nothing is saved."
            footer={
                <div className="flex justify-end gap-2">
                    <SkButton variant="ghost" onClick={onClose}>
                        Cancel
                    </SkButton>
                    <SkButton
                        disabled={form.processing || form.data.csv.trim() === ""}
                        onClick={() =>
                            form.post(route("procurement.tariffs.import"), {
                                preserveScroll: true,
                                onSuccess: () => {
                                    form.reset();
                                    onClose();
                                },
                            })
                        }
                    >
                        Import
                    </SkButton>
                </div>
            }
        >
            <div className="space-y-3">
                <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => loadFile(e.target.files?.[0])} className="text-[13px]" />
                <textarea
                    className={`${inputClass} font-mono text-[12px]`}
                    rows={12}
                    value={form.data.csv}
                    onChange={(e) => form.setData("csv", e.target.value)}
                    placeholder={"hs_code,description,duty,excise,vat,surtax,withholding,other\n8523.51.00,Flash memory,30,0,15,10,3,0"}
                />
                {form.errors.csv ? <p className="text-[12px] text-error">{form.errors.csv}</p> : null}
            </div>
        </SkSheet>
    );
}

ProcurementTariffs.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
