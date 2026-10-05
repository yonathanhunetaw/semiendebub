import { Head, Link, router } from "@inertiajs/react";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import BarcodeScannerDialog from "@/Components/Seller/BarcodeScannerDialog";
import { type CatalogItem, cardPricing, money } from "@/Components/Seller/catalogPricing";
import { categoryIcon } from "@/Components/Seller/categoryIcon";
import { TONES, type Tone } from "@/Components/Shared/ui";

interface Department {
    id: number;
    category_name: string;
    /** Active items in the department and its subcategories. */
    product_count: number;
}

interface Subcategory {
    id: number;
    category_name: string;
    active_items_count: number;
}

interface FeaturedItem extends CatalogItem {
    /** Units sold at this store, canceled and refunded sales excluded. */
    units_sold: number;
}

interface Props {
    mainCategories?: Department[];
    selectedCategory?: Department | null;
    subcategories?: Subcategory[];
    /** Subcategories across every department, for the header. */
    subcategoryCount?: number;
    /** The selected department's best seller at this store; null until something sells. */
    featuredItem?: FeaturedItem | null;
}

/** Subcategory tiles cycle through the tones so neighbours read apart. */
const TILE_TONES: Tone[] = ["primary", "warning", "error", "info", "success", "tertiary", "neutral"];

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/**
 * The seller's Categories tab: departments in a left rail, the selected
 * department's subcategories as tiles, and its best seller underneath.
 * The search box filters both lists as you type.
 */
export default function Index({
    mainCategories = [],
    selectedCategory = null,
    subcategories = [],
    subcategoryCount = 0,
    featuredItem = null,
}: Props) {
    const [query, setQuery] = React.useState("");
    const [scannerOpen, setScannerOpen] = React.useState(false);

    const needle = query.trim().toLowerCase();
    const matches = (name: string) => !needle || name.toLowerCase().includes(needle);
    const departments = mainCategories.filter((d) => d.id === selectedCategory?.id || matches(d.category_name));
    const tiles = subcategories.filter((s) => matches(s.category_name));

    return (
        <div className="flex h-[100dvh] flex-col">
            <Head title="Categories" />

            {/* ========== HEADER ========== */}
            <header className="z-20 shrink-0 border-b border-outline-variant bg-surface-container-lowest px-4 pb-3 pt-3 shadow-sm">
                <div className="mb-2.5">
                    <h1 className="text-xl font-bold leading-none tracking-tight text-on-surface">Categories</h1>
                    <p className="mt-1 text-[11px] font-medium text-on-surface-variant">
                        {plural(mainCategories.length, "Department")} • {subcategoryCount.toLocaleString()} {subcategoryCount === 1 ? "Subcategory" : "Subcategories"}
                    </p>
                </div>

                <div className="flex items-center">
                    <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline">search</span>
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search category or subcategory…"
                            className="h-10 w-full rounded-[12px] border border-transparent bg-surface-container py-2 pl-9 pr-9 text-xs font-medium text-on-surface outline-none transition-all placeholder:text-outline focus:border-primary focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary"
                        />
                        {query && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
                            >
                                <span className="material-symbols-outlined text-[18px]">cancel</span>
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Scan barcode"
                        onClick={() => setScannerOpen(true)}
                        className="ml-2 flex h-10 w-10 items-center justify-center rounded-[12px] border border-primary/30 bg-primary-container text-primary transition-all hover:bg-primary-container/70 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                    </button>
                </div>
            </header>

            {/* ========== MASTER / DETAIL ========== */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-background">
                {/* Department rail */}
                <aside
                    aria-label="Departments"
                    className="flex w-[115px] shrink-0 flex-col overflow-y-auto border-r border-outline-variant bg-surface-container py-1 [scrollbar-width:none] sm:w-[122px] [&::-webkit-scrollbar]:hidden"
                >
                    {departments.map((d) => {
                        const active = d.id === selectedCategory?.id;
                        return (
                            <Link
                                key={d.id}
                                href={route("seller.categories.index", { category_id: d.id })}
                                preserveScroll
                                aria-current={active ? "page" : undefined}
                                className={`flex w-full flex-col items-start gap-1 border-l-4 px-2.5 text-left text-xs transition-all ${
                                    active
                                        ? "border-primary bg-surface-container-lowest py-3.5 font-bold text-primary shadow-sm"
                                        : "border-transparent py-3 font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                                }`}
                            >
                                <span className={`material-symbols-outlined ${active ? "text-[19px] text-primary" : "text-[18px] text-outline"}`}>
                                    {categoryIcon(d.category_name)}
                                </span>
                                <span className={active ? "leading-tight" : "leading-snug"}>{d.category_name}</span>
                                {active && (
                                    <span className="rounded-[999px] bg-primary-container px-1.5 text-[9px] font-semibold text-primary">
                                        {plural(d.product_count, "item")}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                    {/* Clears the floating bottom nav */}
                    <div className="h-24 shrink-0" />
                </aside>

                {/* Selected department */}
                <main className="flex-1 overflow-y-auto bg-surface-container-lowest p-3 [scrollbar-width:none] sm:p-4 [&::-webkit-scrollbar]:hidden">
                    {selectedCategory ? (
                        <>
                            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Department</span>
                                        <span className="h-1 w-1 rounded-[999px] bg-outline-variant" />
                                        <span className="text-[11px] font-medium text-on-surface-variant">
                                            {plural(selectedCategory.product_count, "Product")}
                                        </span>
                                    </div>
                                    <h2 className="truncate text-lg font-bold text-on-surface">{selectedCategory.category_name}</h2>
                                </div>
                                <Link
                                    href={route("seller.categories.show", selectedCategory.id)}
                                    className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary/80"
                                >
                                    View all
                                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                </Link>
                            </div>

                            {tiles.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2.5 pt-3">
                                    {tiles.map((s, i) => {
                                        const tone = TONES[TILE_TONES[i % TILE_TONES.length]];
                                        return (
                                            <Link
                                                key={s.id}
                                                href={route("seller.categories.show", s.id)}
                                                className="group flex h-[96px] flex-col justify-between rounded-[12px] border border-outline-variant bg-background p-2.5 shadow-sm transition-all hover:border-primary/40 hover:bg-primary-container/40 active:bg-primary-container/70"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${tone.pill}`}>
                                                        <span className="material-symbols-outlined text-[18px]">{categoryIcon(s.category_name)}</span>
                                                    </div>
                                                    <span className="material-symbols-outlined text-[18px] text-outline transition-colors group-hover:text-primary">
                                                        arrow_forward
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold leading-tight text-on-surface transition-colors group-hover:text-primary">
                                                        {s.category_name}
                                                    </p>
                                                    <p className="mt-0.5 text-[10px] font-medium text-on-surface-variant">
                                                        {plural(s.active_items_count, "item")}
                                                    </p>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="pt-8 text-center text-sm text-on-surface-variant">
                                    {needle ? "No subcategories match your search." : "No subcategories yet."}
                                </p>
                            )}

                            {featuredItem && <FastMoving item={featuredItem} department={selectedCategory.category_name} />}
                        </>
                    ) : (
                        <p className="pt-8 text-center text-sm text-on-surface-variant">Select a department</p>
                    )}

                    {/* Clears the floating bottom nav */}
                    <div className="h-24" />
                </main>
            </div>

            <BarcodeScannerDialog
                open={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScan={(text) => {
                    setScannerOpen(false);
                    router.get(route("seller.items.search"), { search: text });
                }}
            />
        </div>
    );
}

/** The department's best seller, as a compact link card. */
function FastMoving({ item, department }: { item: FeaturedItem; department: string }) {
    const pricing = cardPricing(item, false);
    const src = item.image_urls?.[0];
    const [broken, setBroken] = React.useState(!src);
    const stock = item.store_stock;

    return (
        <section className="mt-4 border-t border-outline-variant pt-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px] text-primary">local_fire_department</span>
                    Fast moving in {department}
                </span>
                <span className="rounded-[4px] bg-success-container px-1.5 py-0.5 text-[10px] font-medium text-on-success-container">
                    {item.units_sold.toLocaleString()} sold
                </span>
            </div>
            <Link
                href={route("seller.items.show", item.id)}
                className="flex items-center gap-3 rounded-[12px] border border-primary/30 bg-gradient-to-r from-primary-container/80 to-primary-container/30 p-2.5"
            >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-primary/30 bg-surface-container-lowest shadow-sm">
                    {broken ? (
                        <span className="material-symbols-outlined text-2xl text-primary">{categoryIcon(department)}</span>
                    ) : (
                        <img src={src} alt={item.product_name} onError={() => setBroken(true)} className="h-full w-full object-cover" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-semibold text-on-surface">{item.product_name}</h4>
                    <p className="text-[10px] font-medium text-on-surface-variant">
                        {stock === undefined || stock === null ? "" : stock > 0 ? `Stock: ${stock.toLocaleString()}` : "Out of stock"}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs font-bold text-on-surface">
                            {money(pricing.price)}
                            {pricing.hasDiscount && (
                                <span className="ml-1 text-[9px] font-normal text-outline line-through">{money(pricing.original)}</span>
                            )}
                        </span>
                        <span className="inline-flex items-center rounded-[4px] bg-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary">
                            View
                            <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                        </span>
                    </div>
                </div>
            </Link>
        </section>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
