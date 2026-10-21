import React from "react";
import { Head, Link, router, useForm } from "@inertiajs/react";
import ProcurementLayout from "@/Layouts/ProcurementLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkChips, SkField, SkHeader, SkSheet, inputClass, when } from "@/Components/StockKeeper/skKit";
import { money } from "@/Components/Procurement/procurementUi";
import type { ConsignmentSummary } from "@/types/procurement";

interface Props {
    consignments?: ConsignmentSummary[];
    tab: "open" | "done";
    routes?: Array<{ id: number; name: string }>;
    canManage: boolean;
}

/** Goods we bought on their way in: each consignment, where it has got to, and what it has cost so far. */
export default function ProcurementConsignments({ consignments = [], tab, routes = [], canManage }: Props) {
    const [creating, setCreating] = React.useState(false);
    const form = useForm({ freight_route_id: routes[0] ? String(routes[0].id) : "", container_number: "", bill_of_lading: "", eta: "", notes: "" });

    return (
        <>
            <Head title="Shipments in" />
            <SkHeader
                title="Shipments in"
                subtitle="Goods we bought, from the supplier to the dry port. Each stage holds them in stock, so you can see what is on its way; every cost on the way is confirmed by finance or a global admin."
                actions={
                    canManage ? (
                        <SkButton icon="add" onClick={() => setCreating(true)}>
                            New consignment
                        </SkButton>
                    ) : null
                }
            />

            <div className="mb-3">
                <SkChips<"open" | "done">
                    value={tab}
                    onChange={(next) => router.get(route("procurement.consignments.index"), next === "open" ? {} : { tab: next }, { preserveState: true, replace: true })}
                    options={[
                        { value: "open", label: "On the way" },
                        { value: "done", label: "Arrived or cancelled" },
                    ]}
                />
            </div>

            {consignments.length === 0 ? (
                <EmptyState framed icon="sailing" title="Nothing here" description="Start a consignment when goods from a placed order are ready to travel." />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {consignments.map((c) => (
                        <Link key={c.id} href={route("procurement.consignments.show", c.id)} className="block rounded-[16px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm hover:border-primary">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-mono text-[14px] font-bold">{c.reference}</p>
                                    <p className="text-[12px] text-on-surface-variant">
                                        {[c.route, c.container_number, c.eta ? `ETA ${when(c.eta)}` : null].filter(Boolean).join(" · ") || "No route yet"}
                                    </p>
                                </div>
                                <StatusPill label={c.stage_label} tone={c.stage === "forming" ? "neutral" : c.stage === "received" ? "success" : c.stage === "cancelled" ? "error" : "info"} size="sm" />
                            </div>
                            <p className="mt-3 text-[13px]">
                                {c.lines} lines · {c.units} units · {c.cbm} CBM · goods {money(c.goods_value_etb)}
                            </p>
                            <p className="text-[13px] text-on-surface-variant">
                                Costs confirmed {money(c.costs_confirmed_etb)}
                                {c.costs_pending > 0 ? ` · ${c.costs_pending} waiting` : ""}
                            </p>
                        </Link>
                    ))}
                </div>
            )}

            <SkSheet
                open={creating}
                onClose={() => setCreating(false)}
                title="New consignment"
                subtitle="A container or parcel of goods travelling together. You put the order lines on it next."
                footer={
                    <div className="flex justify-end gap-2">
                        <SkButton variant="ghost" onClick={() => setCreating(false)}>
                            Cancel
                        </SkButton>
                        <SkButton disabled={form.processing} onClick={() => form.post(route("procurement.consignments.store"))}>
                            Start it
                        </SkButton>
                    </div>
                }
            >
                <div className="space-y-4">
                    <SkField label="Route" hint="Used for the estimate to compare against." error={form.errors.freight_route_id}>
                        <select className={inputClass} value={form.data.freight_route_id} onChange={(e) => form.setData("freight_route_id", e.target.value)}>
                            <option value="">No route</option>
                            {routes.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </SkField>
                    <div className="grid grid-cols-2 gap-3">
                        <SkField label="Container" error={form.errors.container_number}>
                            <input className={inputClass} value={form.data.container_number} onChange={(e) => form.setData("container_number", e.target.value)} placeholder="MSKU1234567" />
                        </SkField>
                        <SkField label="Bill of lading" error={form.errors.bill_of_lading}>
                            <input className={inputClass} value={form.data.bill_of_lading} onChange={(e) => form.setData("bill_of_lading", e.target.value)} />
                        </SkField>
                    </div>
                    <SkField label="Expected at the dry port" error={form.errors.eta}>
                        <input className={inputClass} type="date" value={form.data.eta} onChange={(e) => form.setData("eta", e.target.value)} />
                    </SkField>
                    <SkField label="Notes" error={form.errors.notes}>
                        <input className={inputClass} value={form.data.notes} onChange={(e) => form.setData("notes", e.target.value)} />
                    </SkField>
                </div>
            </SkSheet>
        </>
    );
}

ProcurementConsignments.layout = (page: React.ReactNode) => <ProcurementLayout>{page}</ProcurementLayout>;
