import { Head, Link } from "@inertiajs/react";
import React from "react";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import { EmptyState, StatusPill } from "@/Components/Shared/ui";
import type { ItemDetail } from "@/types/stockkeeper";

/**
 * Everything about an item for the stock keeper: photos, the catalogue data
 * (read-only; an admin edits it), each SKU with its barcode and volume, and
 * where it is — how much per place, its levels and its floor areas. No prices.
 */

const KIND_LABEL: Record<string, string> = {
    main_hub: "Main Hub",
    remote_hub: "Remote Hub",
    backroom: "Store floor",
    shelf: "Store Shelf",
    store: "Store",
};

const fmt = (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

export default function ItemShow({ item, scanned_variant }: { item: ItemDetail; scanned_variant: number | null }) {
    const gallery = [...item.images, ...item.variants.flatMap((v) => v.images)].filter((src, i, all) => all.indexOf(src) === i);
    const [active, setActive] = React.useState(0);
    const totalPieces = item.stock.reduce((sum, row) => sum + row.pieces, 0);

    return (
        <>
            <Head title={item.name} />

            <Link href={route("stock_keeper.inventory.index")} className="mb-3 inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Stock
            </Link>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
                {/* Photos and the catalogue data. Sticky beside the rest on desktop. */}
                <div className="flex flex-col gap-4 lg:sticky lg:top-6">
                    <section className="overflow-hidden rounded-[24px] border border-outline-variant bg-surface-container-lowest shadow-sm">
                        <div className="flex aspect-square items-center justify-center bg-surface-container-low sm:aspect-[4/3] lg:aspect-square">
                            {gallery.length > 0 ? (
                                <img src={gallery[active]} alt={item.name} className="h-full w-full object-contain" />
                            ) : (
                                <span className="material-symbols-outlined text-[72px] text-on-surface-variant/40">inventory_2</span>
                            )}
                        </div>
                        {gallery.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {gallery.map((src, i) => (
                                    <button
                                        key={src}
                                        type="button"
                                        onClick={() => setActive(i)}
                                        aria-label={`Photo ${i + 1}`}
                                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border-2 ${i === active ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}
                                    >
                                        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
                        {item.category.length > 0 && <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">{item.category.join(" › ")}</p>}
                        <h1 className="mt-1 text-[22px] font-extrabold leading-tight text-on-surface sm:text-[26px]">{item.name}</h1>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <StatusPill status={item.status} />
                            {item.is_incomplete && <StatusPill tone="warning" label="Catalogue incomplete" />}
                        </div>
                        {item.description && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-on-surface-variant">{item.description}</p>}
                        {item.packaging_details && (
                            <p className="mt-3 rounded-[12px] bg-surface-container-low px-3 py-2 text-[13px] text-on-surface-variant">
                                <b className="text-on-surface">Packaging:</b> {item.packaging_details}
                            </p>
                        )}
                        {item.packaging.length > 0 && (
                            <div className="mt-3">
                                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">Pack sizes</p>
                                <div className="flex flex-wrap gap-2">
                                    {item.packaging.map((pack) => (
                                        <span key={pack.id} className="flex items-center gap-2 rounded-[12px] border border-outline-variant bg-surface-container-low py-1 pl-1 pr-3 text-[13px]">
                                            {pack.image ? (
                                                <img src={pack.image} alt="" className="h-7 w-7 rounded-[8px] object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined flex h-7 w-7 items-center justify-center text-[18px] text-primary">package_2</span>
                                            )}
                                            <b className="text-on-surface">{pack.name}</b>
                                            <span className="text-on-surface-variant">{pack.pieces > 1 ? `${fmt(pack.pieces)} pcs` : "single"}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-on-surface-variant">
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            Only an admin changes item details, barcodes and volumes.
                        </p>
                    </section>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    {/* Where it is */}
                    <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
                        <header className="flex items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
                            <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-on-surface">
                                <span className="material-symbols-outlined text-[20px] text-primary">location_on</span>
                                Where it is
                            </h2>
                            <span className="text-[12px] font-bold text-on-surface-variant">{fmt(totalPieces)} pieces in all</span>
                        </header>
                        {item.stock.length === 0 ? (
                            <EmptyState icon="inventory_2" title="None in your places" />
                        ) : (
                            <ul className="grid grid-cols-1 gap-px bg-outline-variant/50 sm:grid-cols-2">
                                {item.stock.map((row) => (
                                    <li key={row.location.id} className="bg-surface-container-lowest p-4">
                                        <p className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
                                            {KIND_LABEL[row.location.kind] ?? row.location.kind}
                                            {row.location.store ? ` · ${row.location.store}` : ""}
                                        </p>
                                        <p className="truncate text-[15px] font-bold text-on-surface">{row.location.name}</p>
                                        <p className="mt-1 text-[20px] font-extrabold tabular-nums text-on-surface">{row.display}</p>
                                        {row.level && (
                                            <p className="mt-1 text-[12px] text-on-surface-variant">
                                                Full {fmt(row.level.max)} · Low {fmt(row.level.low)} · Crit {fmt(row.level.critical)} {row.level.unit}s
                                            </p>
                                        )}
                                        {row.areas.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {row.areas.map((area) => (
                                                    <Link
                                                        key={area.code}
                                                        href={route("stock_keeper.floor.index", { location: row.location.id, item: item.id })}
                                                        className="flex items-center gap-1 rounded-[999px] bg-primary-container px-2.5 py-1 text-[12px] font-bold text-on-primary-container"
                                                    >
                                                        <span className="material-symbols-outlined text-[15px]">grid_view</span>
                                                        Area {area.code}
                                                        {area.name ? ` · ${area.name}` : ""}
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                        {row.by_sku.length > 1 && (
                                            <p className="mt-2 truncate font-mono text-[11px] text-on-surface-variant">
                                                {row.by_sku.map((s) => `${s.sku ?? "—"}: ${fmt(s.quantity)}`).join(" · ")}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* SKUs */}
                    <section className="rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm">
                        <header className="border-b border-outline-variant/70 px-4 py-3">
                            <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-on-surface">
                                <span className="material-symbols-outlined text-[20px] text-primary">barcode</span>
                                SKUs ({item.variants.length})
                            </h2>
                        </header>
                        <ul className="divide-y divide-outline-variant/60">
                            {item.variants.map((variant) => {
                                const scanned = variant.id === scanned_variant;
                                return (
                                    <li key={variant.id} className={`p-4 ${scanned ? "bg-primary-container/40" : ""}`}>
                                        <div className="flex flex-wrap items-start gap-3">
                                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-outline-variant/70 bg-surface-container-low">
                                                {variant.images[0] ? (
                                                    <img src={variant.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-[24px] text-on-surface-variant/50">image</span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-[14px] font-bold text-on-surface">{variant.sku ?? "No SKU"}</span>
                                                    {scanned && <StatusPill tone="primary" label="Scanned" icon="barcode_scanner" size="sm" />}
                                                    {variant.status && <StatusPill status={variant.status} size="sm" />}
                                                </div>
                                                <p className="mt-0.5 text-[13px] text-on-surface-variant">
                                                    {[variant.packaging ? `${variant.packaging.name}${variant.packaging.pieces > 1 ? ` of ${variant.packaging.pieces}` : ""}` : null, variant.color?.name, variant.size]
                                                        .filter(Boolean)
                                                        .join(" · ") || "No colour or size"}
                                                </p>
                                                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
                                                    <div className="flex gap-1.5">
                                                        <dt className="text-on-surface-variant">Barcode</dt>
                                                        <dd className="font-mono font-bold text-on-surface">{variant.barcode ?? "—"}</dd>
                                                    </div>
                                                    {variant.volumes.map((v) => (
                                                        <div key={v.packaging} className="flex gap-1.5">
                                                            <dt className="text-on-surface-variant">{v.packaging}</dt>
                                                            <dd className="font-bold text-on-surface">{v.cbm !== null ? `${fmt(v.cbm, 4)} m³` : "no volume set"}</dd>
                                                        </div>
                                                    ))}
                                                    {variant.owner && (
                                                        <div className="flex gap-1.5">
                                                            <dt className="text-on-surface-variant">Owner</dt>
                                                            <dd className="font-bold text-on-surface">{variant.owner}</dd>
                                                        </div>
                                                    )}
                                                </dl>
                                            </div>
                                            {variant.color?.image && <img src={variant.color.image} alt={variant.color.name} className="h-8 w-8 rounded-[999px] border border-outline-variant object-cover" />}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>
            </div>
        </>
    );
}

ItemShow.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
