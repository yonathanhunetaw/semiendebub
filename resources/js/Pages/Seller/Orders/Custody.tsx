import SellerLayout from "@/Layouts/SellerLayout";
import { birr } from "@/Data/sellerOrderFlow";
import { Head, router } from "@inertiajs/react";
import React, { useState } from "react";

/** App\Services\Fulfillment\CustodyLog::forSale() */
interface Place {
    id: number;
    name: string;
    kind: string;
    label: string;
}

interface Line {
    id: number;
    name: string;
    sku: string | null;
    unit: string | null;
    quantity: number;
    picked_quantity: number;
    status: "reserved" | "picked" | "with_delivery" | "delivered" | "returned";
    source: Place | null;
    picked_by: string | null;
}

interface LogEvent {
    step: number;
    kind: string;
    at: string | null;
    title: string;
    icon: string;
    tone: string;
    detail: string;
    who: string | null;
    where: string | null;
    token: string | null;
}

interface CustodyLog {
    reference: string;
    customer: { name: string; phone: string | null };
    store: string | null;
    seller: string | null;
    total: number;
    payment_status: string;
    stage: string;
    placed_at: string | null;
    phase: { current: number; labels: Record<number, string> };
    delivery: {
        tracking_number: string | null;
        status: string;
        courier: string | null;
        address: string | null;
        failure_reason: string | null;
    } | null;
    lines: Line[];
    events: LogEvent[];
}

interface Props {
    log: CustodyLog;
    /** Where "back" goes without browser history; admin reuses this screen. */
    backRoute?: string;
}

/** Literal class strings so the JIT compiler keeps them. */
const TONE: Record<string, { node: string; chip: string }> = {
    emerald: { node: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    indigo: { node: "bg-indigo-600", chip: "bg-indigo-50 text-indigo-800 border-indigo-200" },
    amber: { node: "bg-amber-500", chip: "bg-amber-50 text-amber-800 border-amber-200" },
    brand: { node: "bg-[#c2410c]", chip: "bg-orange-50 text-orange-800 border-orange-200" },
    rose: { node: "bg-rose-500", chip: "bg-rose-50 text-rose-800 border-rose-200" },
    slate: { node: "bg-slate-400", chip: "bg-slate-50 text-slate-700 border-slate-200" },
};

const LINE_STATUS: Record<Line["status"], { label: string; chip: string }> = {
    reserved: { label: "RESERVED", chip: "bg-slate-100 text-slate-700 border-slate-200" },
    picked: { label: "PICKED", chip: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    with_delivery: { label: "WITH DELIVERY", chip: "bg-amber-100 text-amber-900 border-amber-200" },
    delivered: { label: "DELIVERED", chip: "bg-orange-100 text-[#9b2f00] border-orange-200" },
    returned: { label: "RETURNED", chip: "bg-rose-100 text-rose-800 border-rose-200" },
};

const PLACE_ICON: Record<string, string> = {
    shelf: "shelves",
    backroom: "storefront",
    remote_hub: "warehouse",
    main_hub: "hub",
    transit: "local_shipping",
};

const PHASE_ICON: Record<number, string> = { 1: "storefront", 2: "sync_alt", 3: "local_shipping" };

const time = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

const dateTime = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

const initials = (name: string): string =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

/**
 * Orders / Custody Log — one order's chain of custody.
 *
 * Every row comes from a record: the sale and its payments, the delivery run,
 * and the stock journal written about the order's lines (reserved at checkout,
 * picked off a shelf, floor or Remote Hub into Delivery's custody, delivered
 * or returned). Nothing on this screen is a projection.
 */
export default function Custody({ log, backRoute = "seller.orders.index" }: Props): React.ReactElement {
    const [phase, setPhase] = useState<number>(log.phase.current);

    const back = (): void => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            router.visit(route(backRoute));
        }
    };

    const exportTrail = (): void => {
        const rows = [
            ["step", "when", "event", "detail", "who", "where", "reference"],
            ...log.events.map((e) => [String(e.step), e.at ?? "", e.title, e.detail, e.who ?? "", e.where ?? "", e.token ?? ""]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        link.download = `${log.reference}-custody.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const fromShelf = log.lines.filter((l) => l.source && ["shelf", "backroom"].includes(l.source.kind)).length;
    const fromHub = log.lines.filter((l) => l.source?.kind === "remote_hub").length;

    return (
        <>
            <Head title={`Custody · ${log.reference}`} />

            <div className="min-h-screen bg-[#f8f9ff] pb-28 text-[#0b1c30]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b border-[#dce9ff] bg-[#f8f9ff]/90 backdrop-blur-xl">
                    <div className="flex h-16 items-center justify-between px-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <button
                                type="button"
                                onClick={back}
                                aria-label="Go back"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[999px] hover:bg-[#e5eeff] active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                            </button>
                            <div className="flex min-w-0 flex-col">
                                <div className="flex items-center gap-2">
                                    <h1 className="truncate text-[16px] font-bold">Orders / Custody Log</h1>
                                    <span className="rounded-[999px] bg-[#9b2f00]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#9b2f00]">
                                        LIVE
                                    </span>
                                </div>
                                <span className="flex items-center gap-1 truncate font-mono text-[11px] text-[#565e74]">
                                    <span className="material-symbols-outlined text-[13px] text-[#9b2f00]">tag</span>
                                    {log.reference}
                                    <span className="text-[#e1bfb5]">•</span>
                                    <span className="truncate">{log.customer.name}</span>
                                </span>
                            </div>
                        </div>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] bg-[#c2410c] text-xs font-bold text-white shadow-sm">
                            {initials(log.customer.name) || "—"}
                        </div>
                    </div>
                </header>

                {/* ── Telemetry strip ── */}
                <div className="flex items-center justify-between border-b border-[#d3e4fe] bg-[#dce9ff]/80 px-3 py-2">
                    <span className="font-mono text-[11px] text-[#565e74]">{log.store ?? "Store"}</span>
                    <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-[#565e74]">CUSTODY EVENTS</span>
                        <span className="rounded-[4px] border border-[#9b2f00]/20 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#9b2f00]">
                            {log.events.length} LOGGED
                        </span>
                    </div>
                </div>

                {/* ── Lifecycle pipeline ── */}
                <section className="p-3 pb-1">
                    <div className="flex flex-col gap-2 rounded-[16px] border border-[#dce9ff] bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px] text-[#9b2f00]">account_tree</span>
                                <h2 className="text-[14px] font-bold uppercase tracking-wide">Lifecycle Pipeline</h2>
                            </div>
                            <span className="flex items-center gap-1 rounded-[999px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                                <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                Phase {log.phase.current}/3
                            </span>
                        </div>

                        <div className="relative flex items-center justify-between gap-2 px-2 py-2">
                            <div className="absolute left-8 right-8 top-6 z-0 h-1 rounded-[999px] bg-gradient-to-r from-emerald-500 via-[#c2410c] to-[#9b2f00]" />
                            {[1, 2, 3].map((p) => {
                                const reached = p <= log.phase.current;
                                const selected = p === phase;

                                return (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPhase(p)}
                                        className="relative z-10 flex flex-1 flex-col items-center text-center active:scale-95"
                                    >
                                        <div
                                            className={`flex h-9 w-9 items-center justify-center rounded-[999px] border-2 border-white shadow ${
                                                selected
                                                    ? "bg-[#9b2f00] text-white ring-4 ring-orange-200"
                                                    : reached
                                                      ? "bg-[#c2410c] text-white"
                                                      : "bg-[#e5eeff] text-[#565e74]"
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">{PHASE_ICON[p]}</span>
                                        </div>
                                        <span
                                            className={`mt-2 rounded-[4px] px-1.5 font-mono text-[9px] font-bold uppercase ${
                                                selected ? "bg-[#9b2f00] text-white" : "bg-[#e5eeff] text-[#565e74]"
                                            }`}
                                        >
                                            {p}. {log.phase.labels[p]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="border-t border-[#dce9ff] pt-3">
                            {phase === 1 ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <span className="font-mono text-[11px] text-[#565e74]">{dateTime(log.placed_at)}</span>
                                            <h3 className="mt-1 text-[16px] font-bold">{log.customer.name}</h3>
                                            <span className="text-[12px] text-[#565e74]">{log.store ?? ""}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[16px] font-extrabold text-[#9b2f00]">{birr(log.total)}</span>
                                            <span className="rounded-[4px] bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-700">
                                                {log.payment_status}
                                            </span>
                                        </div>
                                    </div>
                                    <Facts
                                        rows={[
                                            ["Payment", log.payment_status],
                                            ["Taken by", log.seller ?? "—"],
                                            ["Stage", log.stage.replace(/_/g, " ")],
                                        ]}
                                    />
                                </div>
                            ) : null}

                            {phase === 2 ? (
                                <div className="flex flex-col gap-2">
                                    {log.lines.map((line) => (
                                        <div key={line.id} className="flex items-center justify-between rounded-[12px] border border-[#dce9ff] bg-[#eff4ff] p-2.5">
                                            <div className="min-w-0">
                                                <p className="truncate text-[13px] font-bold">
                                                    {line.name} ({line.quantity} {line.unit ?? "units"})
                                                </p>
                                                <p className="truncate font-mono text-[10px] text-[#565e74]">
                                                    {line.source ? line.source.label : "Not picked yet"}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-[4px] border px-2 py-0.5 font-mono text-[10px] font-bold ${LINE_STATUS[line.status].chip}`}>
                                                {LINE_STATUS[line.status].label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {phase === 3 ? (
                                log.delivery ? (
                                    <Facts
                                        rows={[
                                            ["Tracking", log.delivery.tracking_number ?? "—"],
                                            ["Status", log.delivery.status.replace(/_/g, " ")],
                                            ["Courier", log.delivery.courier ?? "Not claimed yet"],
                                            ["Delivery address", log.delivery.address ?? "—"],
                                            ...(log.delivery.failure_reason ? ([["Last failure", log.delivery.failure_reason]] as Array<[string, string]>) : []),
                                        ]}
                                    />
                                ) : (
                                    <p className="text-[12px] text-[#565e74]">Delivery is assigned once every line has been picked.</p>
                                )
                            ) : null}
                        </div>
                    </div>
                </section>

                <div className="flex flex-col gap-3 px-3 py-2">
                    {/* ── Sourcing allocations ── */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px] text-[#9b2f00]">forklift</span>
                                <h2 className="text-[15px] font-bold uppercase tracking-tight">Sourcing Allocations ({log.lines.length})</h2>
                            </div>
                            <span className="rounded-[4px] bg-[#e5eeff] px-2 py-0.5 font-mono text-[11px] font-bold text-[#565e74]">
                                {fromShelf} Store · {fromHub} Remote Hub
                            </span>
                        </div>

                        {log.lines.map((line) => (
                            <div key={line.id} className="flex flex-col gap-2 rounded-[16px] border border-[#dce9ff] bg-white p-3 shadow-sm">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-emerald-200 bg-emerald-50 text-emerald-700">
                                            <span className="material-symbols-outlined text-[22px]">inventory_2</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-bold">{line.name}</p>
                                            <p className="font-mono text-[11px] text-[#565e74]">
                                                SKU: {line.sku ?? "—"} | {line.quantity} {line.unit ?? "units"}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 rounded-[999px] border px-2.5 py-0.5 font-mono text-[11px] font-bold ${LINE_STATUS[line.status].chip}`}>
                                        {LINE_STATUS[line.status].label}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] bg-[#eff4ff] p-2.5">
                                    <PathStep
                                        icon={PLACE_ICON[line.source?.kind ?? ""] ?? "help"}
                                        label={line.source?.label ?? "Awaiting pick"}
                                        active={line.source !== null}
                                    />
                                    <span className="material-symbols-outlined text-[14px] text-[#565e74]">arrow_forward</span>
                                    <PathStep
                                        icon="local_shipping"
                                        label="In Delivery"
                                        active={["with_delivery", "delivered", "returned"].includes(line.status)}
                                    />
                                    <span className="material-symbols-outlined text-[14px] text-[#565e74]">arrow_forward</span>
                                    <PathStep
                                        icon={line.status === "returned" ? "assignment_return" : "person_pin"}
                                        label={line.status === "returned" ? "Back to stock" : "Customer"}
                                        active={["delivered", "returned"].includes(line.status)}
                                    />
                                    {line.picked_by ? (
                                        <span className="ml-auto font-mono text-[10px] text-[#565e74]">picked by {line.picked_by}</span>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Audit trail & chain of custody ── */}
                    <div className="mt-1 flex flex-col gap-1">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px] text-[#9b2f00]">verified_user</span>
                                <h2 className="text-[15px] font-bold uppercase tracking-tight">Audit Trail &amp; Chain of Custody</h2>
                            </div>
                            <span className="rounded-[999px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
                                {log.events.length} Events
                            </span>
                        </div>

                        <div className="relative flex flex-col rounded-[16px] border border-[#dce9ff] bg-white p-3 shadow-sm">
                            <div className="absolute bottom-7 left-[29px] top-7 z-0 w-0.5 bg-gradient-to-b from-emerald-500 via-purple-400 to-[#c2410c]" />
                            {log.events.map((event, index) => {
                                const tone = TONE[event.tone] ?? TONE.slate;
                                const current = index === log.events.length - 1;

                                return (
                                    <div key={event.step} className={`relative z-10 flex items-start gap-3.5 ${current ? "" : "pb-5"}`}>
                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] text-white shadow-md ring-4 ring-white ${tone.node}`}>
                                            <span className="material-symbols-outlined text-[18px]">{event.icon}</span>
                                        </div>
                                        <div className={`flex-1 rounded-[12px] border bg-[#eff4ff]/70 p-3 ${current ? "border-2 border-[#9b2f00]/20" : "border-[#dce9ff]"}`}>
                                            <div className="flex flex-wrap items-center justify-between gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[14px] font-bold">{event.title}</span>
                                                    {current ? (
                                                        <span className="rounded-[4px] bg-[#9b2f00]/10 px-1.5 font-mono text-[9px] font-bold uppercase text-[#9b2f00]">
                                                            Current
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <span className="rounded-[999px] border border-[#dce9ff] bg-white px-2 py-0.5 font-mono text-[11px] text-[#565e74]">
                                                    {time(event.at)}
                                                </span>
                                            </div>
                                            {event.detail ? (
                                                <p className="mt-1 text-[12px] leading-snug text-[#59413a]">{event.detail}</p>
                                            ) : null}
                                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#d3e4fe]/60 pt-2">
                                                {event.who ? (
                                                    <span className="inline-flex items-center gap-1 rounded-[999px] border border-[#dce9ff] bg-white px-2 py-0.5 font-mono text-[10px] font-medium">
                                                        <span className="material-symbols-outlined text-[12px] text-[#9b2f00]">person</span>
                                                        {event.who}
                                                    </span>
                                                ) : null}
                                                {event.where ? (
                                                    <span className={`inline-flex items-center gap-1 rounded-[999px] border px-2 py-0.5 font-mono text-[10px] font-semibold ${tone.chip}`}>
                                                        <span className="material-symbols-outlined text-[12px]">location_on</span>
                                                        {event.where}
                                                    </span>
                                                ) : null}
                                                {event.token ? (
                                                    <span className="ml-auto font-mono text-[10px] font-bold text-[#9b2f00]">{event.token}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {log.events.length === 0 ? (
                                <p className="py-4 text-center text-[12px] text-[#565e74]">Nothing has happened to this order yet.</p>
                            ) : null}
                        </div>
                    </div>

                    {/* ── Custody operations ── */}
                    <div className="mb-4 mt-1 flex flex-col gap-1">
                        <h2 className="px-1 text-[15px] font-bold uppercase tracking-tight">Custody Operations</h2>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#9b2f00] text-[14px] font-bold text-white shadow-md active:scale-95"
                        >
                            <span className="material-symbols-outlined text-[20px]">print</span>
                            Print Waybill &amp; Custody Certificate
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            {log.customer.phone ? (
                                <a
                                    href={`tel:${log.customer.phone}`}
                                    className="flex h-11 items-center justify-center gap-1.5 rounded-[12px] border border-[#dce9ff] bg-white font-mono text-xs font-semibold shadow-sm active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[18px] text-[#565e74]">call</span>
                                    Call Customer
                                </a>
                            ) : (
                                <span className="flex h-11 items-center justify-center gap-1.5 rounded-[12px] border border-slate-200 bg-slate-50 font-mono text-xs text-slate-400">
                                    <span className="material-symbols-outlined text-[18px]">call</span>
                                    No phone on file
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={exportTrail}
                                className="flex h-11 items-center justify-center gap-1.5 rounded-[12px] border border-[#dce9ff] bg-white font-mono text-xs font-semibold shadow-sm active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[18px] text-[#9b2f00]">download</span>
                                Audit Trail (CSV)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

function Facts({ rows }: { rows: Array<[string, string]> }): React.ReactElement {
    return (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#dce9ff] bg-[#eff4ff] p-2.5">
            {rows.map(([label, value], index) => (
                <div
                    key={label}
                    className={`flex items-center justify-between gap-3 text-xs ${index > 0 ? "border-t border-[#d3e4fe]/60 pt-1" : ""}`}
                >
                    <span className="font-mono font-semibold uppercase text-[#565e74]">{label}</span>
                    <span className="text-right font-mono font-bold capitalize">{value}</span>
                </div>
            ))}
        </div>
    );
}

function PathStep({ icon, label, active }: { icon: string; label: string; active: boolean }): React.ReactElement {
    return (
        <span
            className={`flex items-center gap-1 rounded-[6px] px-2 py-1 font-mono text-[11px] font-bold ${
                active ? "bg-emerald-600 text-white" : "border border-[#dce9ff] bg-white text-[#565e74]"
            }`}
        >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
            {label}
        </span>
    );
}

Custody.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
