import React from "react";
import { Head, Link, router, useForm } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { SkButton, SkCard, SkCardHeader, SkField, SkHeader, inputClass } from "@/Components/StockKeeper/skKit";
import type { PaymentTerms, Supplier, SupplierContact } from "@/types/procurement";

interface Props {
    supplier: Supplier | null;
    currencies?: string[];
    paymentTerms?: Record<PaymentTerms, string>;
}

interface SupplierForm {
    name: string;
    country: string;
    city: string;
    currency: string;
    phone: string;
    email: string;
    address: string;
    contacts: SupplierContact[];
    default_payment_terms: PaymentTerms;
    default_payment_days: string;
    notes: string;
    is_active: boolean;
}

/** Add or edit a supplier. */
export default function SupplierForm({ supplier, currencies = [], paymentTerms = {} as Record<PaymentTerms, string> }: Props) {
    const { data, setData, post, put, processing, errors, transform } = useForm<SupplierForm>({
        name: supplier?.name ?? "",
        country: supplier?.country ?? "",
        city: supplier?.city ?? "",
        currency: supplier?.currency ?? "USD",
        phone: supplier?.phone ?? "",
        email: supplier?.email ?? "",
        address: supplier?.address ?? "",
        contacts: supplier?.contacts ?? [],
        default_payment_terms: supplier?.default_payment_terms ?? "immediate",
        default_payment_days: supplier?.default_payment_days != null ? String(supplier.default_payment_days) : "",
        notes: supplier?.notes ?? "",
        is_active: supplier?.is_active ?? true,
    });
    const err = errors as Record<string, string | undefined>;

    transform((d) => ({ ...d, default_payment_days: d.default_payment_terms === "fixed_date" && d.default_payment_days !== "" ? Number(d.default_payment_days) : null }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (supplier) put(route("procurement.suppliers.update", supplier.id));
        else post(route("procurement.suppliers.store"));
    };

    const setContact = (i: number, patch: Partial<SupplierContact>) => setData("contacts", data.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));

    const remove = () => {
        if (!supplier) return;
        router.delete(route("procurement.suppliers.destroy", supplier.id));
    };

    return (
        <>
            <Head title={supplier ? supplier.name : "Add supplier"} />

            <SkHeader
                title={supplier ? supplier.name : "Add supplier"}
                subtitle="The shop's details and how it is usually paid. Each new order starts from these terms."
                actions={
                    supplier ? (
                        <Link href={route("procurement.purchase_orders.create", { supplier: supplier.id })} className="inline-flex items-center gap-1.5 rounded-[12px] border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-[14px] font-bold text-primary hover:bg-surface-container-low">
                            <span className="material-symbols-outlined text-[19px]">add</span>
                            Order from this supplier
                        </Link>
                    ) : null
                }
            />

            <form onSubmit={submit} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <SkCard className="xl:col-span-2">
                    <SkCardHeader icon="storefront" title="The shop" />
                    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <SkField label="Name" error={err.name}>
                                <input className={inputClass} value={data.name} onChange={(e) => setData("name", e.target.value)} required />
                            </SkField>
                        </div>
                        <SkField label="Country" error={err.country}>
                            <input className={inputClass} value={data.country} onChange={(e) => setData("country", e.target.value)} placeholder="China" />
                        </SkField>
                        <SkField label="City" error={err.city}>
                            <input className={inputClass} value={data.city} onChange={(e) => setData("city", e.target.value)} placeholder="Yiwu" />
                        </SkField>
                        <SkField label="Phone" error={err.phone}>
                            <input className={inputClass} value={data.phone} onChange={(e) => setData("phone", e.target.value)} />
                        </SkField>
                        <SkField label="Email" error={err.email}>
                            <input type="email" className={inputClass} value={data.email} onChange={(e) => setData("email", e.target.value)} />
                        </SkField>
                        <div className="sm:col-span-2">
                            <SkField label="Address" error={err.address}>
                                <textarea className={inputClass} rows={2} value={data.address} onChange={(e) => setData("address", e.target.value)} />
                            </SkField>
                        </div>
                        <div className="sm:col-span-2">
                            <SkField label="Notes" error={err.notes}>
                                <textarea className={inputClass} rows={2} value={data.notes} onChange={(e) => setData("notes", e.target.value)} />
                            </SkField>
                        </div>
                    </div>

                    <div className="border-t border-outline-variant/70 p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-[14px] font-extrabold">People to talk to</p>
                            <SkButton variant="ghost" icon="person_add" onClick={() => setData("contacts", [...data.contacts, { name: "", role: "", phone: "", email: "" }])}>
                                Add
                            </SkButton>
                        </div>
                        {data.contacts.length === 0 ? <p className="text-[13px] text-on-surface-variant">No contacts yet.</p> : null}
                        <div className="space-y-3">
                            {data.contacts.map((c, i) => (
                                <div key={i} className="grid grid-cols-1 gap-2 rounded-[14px] border border-outline-variant/70 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                                    <input className={inputClass} placeholder="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} aria-label="Contact name" />
                                    <input className={inputClass} placeholder="Role" value={c.role ?? ""} onChange={(e) => setContact(i, { role: e.target.value })} aria-label="Contact role" />
                                    <input className={inputClass} placeholder="Phone / WeChat" value={c.phone ?? ""} onChange={(e) => setContact(i, { phone: e.target.value })} aria-label="Contact phone" />
                                    <input className={inputClass} placeholder="Email" value={c.email ?? ""} onChange={(e) => setContact(i, { email: e.target.value })} aria-label="Contact email" />
                                    <SkButton variant="danger" icon="delete" aria-label="Remove contact" onClick={() => setData("contacts", data.contacts.filter((_, j) => j !== i))} className="px-3" />
                                    {err[`contacts.${i}.name`] || err[`contacts.${i}.email`] ? (
                                        <p className="text-[12px] text-error sm:col-span-5">{err[`contacts.${i}.name`] ?? err[`contacts.${i}.email`]}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                </SkCard>

                <div className="space-y-4">
                    <SkCard>
                        <SkCardHeader icon="payments" title="Money" />
                        <div className="space-y-4 p-4">
                            <SkField label="Invoices in" error={err.currency}>
                                <select className={inputClass} value={data.currency} onChange={(e) => setData("currency", e.target.value)}>
                                    {currencies.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </SkField>
                            <SkField label="Usual payment terms" error={err.default_payment_terms}>
                                <select className={inputClass} value={data.default_payment_terms} onChange={(e) => setData("default_payment_terms", e.target.value as PaymentTerms)}>
                                    {(Object.keys(paymentTerms) as PaymentTerms[]).map((k) => (
                                        <option key={k} value={k}>
                                            {paymentTerms[k]}
                                        </option>
                                    ))}
                                </select>
                            </SkField>
                            {data.default_payment_terms === "fixed_date" ? (
                                <SkField label="Days after the order" error={err.default_payment_days}>
                                    <input type="number" min={0} className={inputClass} value={data.default_payment_days} onChange={(e) => setData("default_payment_days", e.target.value)} />
                                </SkField>
                            ) : null}
                            <label className="flex items-center gap-2 text-[14px] font-bold">
                                <input type="checkbox" checked={data.is_active} onChange={(e) => setData("is_active", e.target.checked)} className="rounded-[4px] border-outline-variant text-primary focus:ring-0" />
                                Active (can be ordered from)
                            </label>
                        </div>
                    </SkCard>

                    <div className="flex flex-col gap-2">
                        <SkButton type="submit" icon="save" disabled={processing}>
                            {supplier ? "Save supplier" : "Add supplier"}
                        </SkButton>
                        <Link href={route("procurement.suppliers.index")} className="text-center text-[14px] font-bold text-on-surface-variant hover:text-primary">
                            Back to suppliers
                        </Link>
                        {supplier ? (
                            <SkButton variant="danger" icon="delete" onClick={remove}>
                                {supplier.orders_count ? "Deactivate" : "Remove supplier"}
                            </SkButton>
                        ) : null}
                    </div>
                </div>
            </form>
        </>
    );
}

SupplierForm.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
