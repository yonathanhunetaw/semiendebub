import { Head, Link, router } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import ScanSheet from "@/Components/StockKeeper/ScanSheet";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import type { StocktakeDetail, StocktakeLine } from "@/types/stockkeeper";
import { useBusy } from "@/hooks/useBusy";
import { STOCKTAKE_STATUS } from "@/Components/StockKeeper/stocktakeStatus";

/**
 * One count. Type counts per line, or scan: each scan adds one to that line
 * (or adds the line, for something the ledger didn't expect). Submit when
 * done; someone else approves and the differences are booked.
 */

const fmt = (n: number) => n.toLocaleString();
const plural = (unit: string, n: number) => (Math.abs(n) === 1 ? unit : `${unit}s`);

export default function StocktakeShow({ stocktake }: { stocktake: StocktakeDetail }) {
    const t = stocktake;
    const counting = t.status === "counting";
    const [filter, setFilter] = React.useState<"all" | "todo" | "diff">("all");
    const [search, setSearch] = React.useState("");
    const [scanning, setScanning] = React.useState(false);
    const [lastScan, setLastScan] = React.useState<string | null>(null);
    const status = STOCKTAKE_STATUS[t.status];

    const query = search.trim().toLowerCase();
    const lines = t.lines.filter(
        (l) =>
            (filter === "all" || (filter === "todo" ? l.counted === null : l.variance !== null && l.variance !== 0)) &&
            (query === "" || l.name.toLowerCase().includes(query) || (l.sku ?? "").toLowerCase().includes(query) || (l.barcode ?? "") === query),
    );

    const count = (line: Pick<StocktakeLine, "item_variant_id">, counted: number) =>
        router.post(route("stock_keeper.stocktakes.count", t.id), { item_variant_id: line.item_variant_id, counted: Math.max(0, counted) }, { preserveScroll: true, preserveState: true, only: ["stocktake", "flash"] });

    // A scan adds one to its line; an unknown line is added by the server.
    const onScan = (code: string) => {
        const line = t.lines.find((l) => l.barcode === code || l.sku === code);
        if (line) {
            count(line, (line.counted ?? 0) + 1);
            setLastScan(`${line.name}: ${(line.counted ?? 0) + 1} ${plural(line.unit, (line.counted ?? 0) + 1)}`);
        } else {
            router.post(route("stock_keeper.stocktakes.count", t.id), { code, counted: 1 }, { preserveScroll: true, preserveState: true, only: ["stocktake", "flash"] });
            setLastScan(`${code}: added as a new line`);
        }
    };

    const { busy, post } = useBusy();
    const act = (name: "submit" | "post" | "void") => post(route(`stock_keeper.stocktakes.${name}`, t.id), {}, { preserveScroll: true });

    return (
        <>
            <Head title={`Count ${t.reference}`} />

            <Link href={route("stock_keeper.stocktakes.index")} className="mb-3 inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Stocktakes
            </Link>

            <section className="mb-4 rounded-[24px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm sm:p-5 lg:mb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="font-mono text-[12px] text-on-surface-variant">{t.reference}</p>
                        <h1 className="truncate text-[22px] font-extrabold text-on-surface sm:text-[26px]">{t.location.name}</h1>
                        <p className="text-[13px] text-on-surface-variant">
                            Started by {t.started_by ?? "—"}
                            {t.submitted_by ? ` · submitted by ${t.submitted_by}` : ""}
                            {t.approved_by ? ` · approved by ${t.approved_by}` : ""}
                            {t.note ? ` · ${t.note}` : ""}
                        </p>
                    </div>
                    <StatusPill tone={status.tone} label={status.label} icon={status.icon} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                        { label: "Lines", value: t.totals.lines },
                        { label: "Counted", value: t.totals.counted },
                        { label: "Matching", value: t.totals.matching },
                        { label: "Over", value: t.totals.over },
                        { label: "Short", value: t.totals.short },
                    ].map((s) => (
                        <div key={s.label} className="rounded-[14px] bg-surface-container-low px-3 py-2">
                            <p className="text-[12px] font-bold text-on-surface-variant">{s.label}</p>
                            <p className="text-[20px] font-extrabold tabular-nums text-on-surface">{fmt(s.value)}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {counting && (
                        <>
                            <button type="button" onClick={() => setScanning(true)} className="flex items-center gap-1.5 rounded-[12px] bg-primary px-4 py-2.5 text-[14px] font-bold text-on-primary shadow-sm">
                                <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                                Count by scanning
                            </button>
                            <button type="button" onClick={() => act("submit")} disabled={busy || t.totals.counted === 0} className="flex items-center gap-1.5 rounded-[12px] border border-primary px-4 py-2.5 text-[14px] font-bold text-primary disabled:opacity-50">
                                <span className="material-symbols-outlined text-[20px]">send</span>
                                Submit count
                            </button>
                        </>
                    )}
                    {t.status === "submitted" &&
                        (t.can_approve ? (
                            <button type="button" onClick={() => act("post")} disabled={busy} className="flex items-center gap-1.5 rounded-[12px] bg-success px-4 py-2.5 text-[14px] font-bold text-on-success shadow-sm">
                                <span className="material-symbols-outlined text-[20px]">task_alt</span>
                                Approve and book {t.totals.over + t.totals.short} difference{t.totals.over + t.totals.short === 1 ? "" : "s"}
                            </button>
                        ) : (
                            <p className="flex items-center gap-1.5 rounded-[12px] bg-warning-container px-3 py-2 text-[13px] font-bold text-on-warning-container">
                                <span className="material-symbols-outlined text-[18px]">group</span>
                                Someone other than you approves this count.
                            </p>
                        ))}
                    {(counting || t.status === "submitted") && (
                        <button type="button" onClick={() => act("void")} disabled={busy} className="rounded-[12px] px-3 py-2.5 text-[14px] font-bold text-error hover:bg-error-container/50">
                            Void
                        </button>
                    )}
                </div>
            </section>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2 rounded-[14px] border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-sm focus-within:border-primary">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an item, SKU or barcode" className="w-full border-0 bg-transparent p-0 text-[15px] focus:ring-0" />
                </div>
                <div className="flex gap-2">
                    {(
                        [
                            ["all", "All"],
                            ["todo", "To count"],
                            ["diff", "Differences"],
                        ] as const
                    ).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-[999px] border px-3.5 py-1.5 text-[13px] font-bold ${filter === key ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {lines.length === 0 ? (
                <EmptyState icon="fact_check" title="No lines here" framed />
            ) : (
                <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                    {lines.map((line) => (
                        <CountLine key={line.id} line={line} editable={counting} onCount={(n) => count(line, n)} />
                    ))}
                </ul>
            )}

            <ScanSheet open={scanning} onClose={() => setScanning(false)} onCode={onScan} continuous title="Count by scanning" hint="Each scan adds one to that line, in its own packaging.">
                {lastScan && (
                    <p className="mt-3 flex items-center gap-2 rounded-[12px] bg-success-container px-3 py-2 text-[14px] font-bold text-on-success-container">
                        <span className="material-symbols-outlined text-[20px]">check_circle</span>
                        {lastScan}
                    </p>
                )}
            </ScanSheet>
        </>
    );
}

function CountLine({ line, editable, onCount }: { line: StocktakeLine; editable: boolean; onCount: (n: number) => void }) {
    const [value, setValue] = React.useState(line.counted !== null ? String(line.counted) : "");
    React.useEffect(() => setValue(line.counted !== null ? String(line.counted) : ""), [line.counted]);
    const commit = () => {
        if (value === "" || Number(value) === line.counted) return;
        onCount(Number(value));
    };
    const v = line.variance;
    const tone = v === null ? "" : v === 0 ? "border-success/50" : v > 0 ? "border-info/60" : "border-error/60";

    return (
        <li className={`rounded-[18px] border bg-surface-container-lowest p-3.5 shadow-sm ${tone || "border-outline-variant"}`}>
            <div className="flex items-start justify-between gap-2">
                <Link href={route("stock_keeper.items.show", line.item_id)} className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-on-surface hover:underline">{line.name}</p>
                    <p className="truncate font-mono text-[11px] text-on-surface-variant">
                        {line.sku ?? "—"}
                        {line.variant ? ` · ${line.variant}` : ""}
                    </p>
                </Link>
                {v !== null && (
                    <span className={`shrink-0 rounded-[999px] px-2 py-0.5 text-[12px] font-extrabold ${v === 0 ? "bg-success-container text-on-success-container" : v > 0 ? "bg-info-container text-on-info-container" : "bg-error-container text-on-error-container"}`}>
                        {v === 0 ? "Matches" : `${v > 0 ? "+" : ""}${fmt(v)}`}
                    </span>
                )}
            </div>
            <div className="mt-3 flex items-end gap-3">
                <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase text-on-surface-variant">Expected</p>
                    <p className="text-[18px] font-extrabold tabular-nums text-on-surface">
                        {fmt(line.expected)} <span className="text-[13px] font-bold text-on-surface-variant">{plural(line.unit, line.expected)}</span>
                    </p>
                </div>
                {editable ? (
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => onCount(Math.max(0, (line.counted ?? 0) - 1))} aria-label="One less" className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-outline-variant text-on-surface-variant hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[20px]">remove</span>
                        </button>
                        <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={value}
                            placeholder="?"
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => e.key === "Enter" && commit()}
                            aria-label={`Counted ${line.name}`}
                            className="h-10 w-20 rounded-[10px] border border-outline-variant bg-surface-container-low px-2 text-center text-[17px] font-extrabold tabular-nums focus:border-primary focus:ring-0"
                        />
                        <button type="button" onClick={() => onCount((line.counted ?? 0) + 1)} aria-label="One more" className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary text-on-primary">
                            <span className="material-symbols-outlined text-[20px]">add</span>
                        </button>
                    </div>
                ) : (
                    <div className="text-right">
                        <p className="text-[11px] font-bold uppercase text-on-surface-variant">Counted</p>
                        <p className="text-[18px] font-extrabold tabular-nums text-on-surface">{line.counted !== null ? fmt(line.counted) : "—"}</p>
                    </div>
                )}
            </div>
        </li>
    );
}

StocktakeShow.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
