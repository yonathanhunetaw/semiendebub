import { Head, Link, router } from "@inertiajs/react";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import BarcodeScannerDialog from "@/Components/Seller/BarcodeScannerDialog";
import { type CatalogItem, cardPricing, money } from "@/Components/Seller/catalogPricing";
import { EmptyState } from "@/Components/Shared/ui";

interface CategoryFilter {
    id: number;
    name: string;
}

interface Props {
    items?: CatalogItem[];
    nextPageUrl?: string | null;
    filters?: { search?: string; category_id?: number | null };
    /** Every category the store carries (SellerCatalog::categories). */
    categories?: CategoryFilter[];
    has_tin_cart?: boolean;
    top_cart_is_individual?: boolean;
}

/** Stored paths come back absolute from ImageResolver; this covers stragglers. */
function imageUrl(path?: string): string | null {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const base = import.meta.env.VITE_AWS_URL || "http://duka.test:9000/duka-images";
    return `${base}/${path.replace(/^\//, "")}`;
}

// ======================== DISCOUNT COUNTDOWN ========================

function useCountdown(endsAt: string | null): string | null {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        if (!endsAt) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [endsAt]);

    if (!endsAt) return null;
    const diff = new Date(endsAt).getTime() - now;
    if (diff <= 0) return null;

    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function DiscountCountdown({ endsAt }: { endsAt: string }): React.ReactElement | null {
    const label = useCountdown(endsAt);
    if (!label) return null;

    return (
        <span
            title={`Discount ends ${new Date(endsAt).toLocaleString()}`}
            className="inline-flex items-center gap-0.5 rounded-md bg-inverse-surface/80 px-1.5 py-0.5 text-[10px] font-bold text-inverse-on-surface backdrop-blur-sm"
        >
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            {label}
        </span>
    );
}

// ======================== SEARCH BAR ========================

/** Cycles example searches through the empty search box, like the shelf talker on a till. */
function useRotatingHint(hints: string[]): { hint: string; visible: boolean } {
    const [index, setIndex] = React.useState(0);
    const [visible, setVisible] = React.useState(true);

    React.useEffect(() => {
        if (hints.length < 2) return;
        let swap: number | undefined;
        const timer = window.setInterval(() => {
            setVisible(false);
            swap = window.setTimeout(() => {
                setIndex((i) => (i + 1) % hints.length);
                setVisible(true);
            }, 300);
        }, 2500);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(swap);
        };
    }, [hints.length]);

    return { hint: hints[index % Math.max(hints.length, 1)] ?? "", visible };
}

// ======================== PRODUCT CARD ========================

function ProductCard({ item, hasTinCart, topCartIsIndividual }: { item: CatalogItem; hasTinCart: boolean; topCartIsIndividual: boolean }) {
    const pricing = cardPricing(item, topCartIsIndividual);
    const src = imageUrl(item.image_urls?.[0]);
    const [loaded, setLoaded] = React.useState(false);
    const [broken, setBroken] = React.useState(!src);
    const stock = item.store_stock;
    const outOfStock = stock !== undefined && stock !== null && stock <= 0;

    return (
        <Link
            href={route("seller.items.show", item.id)}
            className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md"
        >
            <div>
                <div className="relative aspect-square w-full overflow-hidden bg-surface-container-low">
                    {broken ? (
                        <div className="flex h-full w-full items-center justify-center text-outline">
                            <span className="material-symbols-outlined text-[40px]">image</span>
                        </div>
                    ) : (
                        <>
                            {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-container" />}
                            <img
                                src={src!}
                                alt={item.product_name}
                                loading="lazy"
                                onLoad={() => setLoaded(true)}
                                onError={() => setBroken(true)}
                                className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
                            />
                        </>
                    )}

                    {stock !== undefined && stock !== null && (
                        <span
                            className={`absolute left-2 top-2 rounded-[999px] border px-2 py-0.5 text-[10px] font-bold shadow-sm ${
                                outOfStock
                                    ? "border-warning/30 bg-warning-container text-on-warning-container"
                                    : "border-success/30 bg-success-container text-on-success-container"
                            }`}
                        >
                            {outOfStock ? "Out of stock" : "In stock"}
                        </span>
                    )}
                    {pricing.hasDiscount && (
                        <span className="absolute right-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-on-primary shadow-sm">
                            -{pricing.discountPercent}%
                        </span>
                    )}
                    {((pricing.hasDiscount && pricing.discountEndsAt) || pricing.isSellerPrice) && (
                        <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1">
                            {pricing.hasDiscount && pricing.discountEndsAt && <DiscountCountdown endsAt={pricing.discountEndsAt} />}
                            {pricing.isSellerPrice && (
                                <span className="rounded-md bg-inverse-surface px-1.5 py-0.5 text-[10px] font-semibold text-inverse-on-surface">
                                    Seller price
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-2.5 pt-2">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {item.category?.category_name || "General"}
                    </span>
                    <h2 className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-tight text-on-surface" title={item.product_name}>
                        {item.product_name}
                    </h2>
                </div>
            </div>

            <div className="mt-1 p-2.5 pt-0">
                {(pricing.hasDiscount || hasTinCart) && (
                    <div className="mb-0.5 flex items-center justify-between gap-1">
                        {pricing.hasDiscount ? (
                            <span className="text-[11px] text-outline line-through">{money(pricing.original)}</span>
                        ) : (
                            <span />
                        )}
                        {hasTinCart && (
                            <span className="rounded-[4px] border border-success/30 bg-success-container px-1 text-[10px] font-medium text-on-success-container">
                                incl. VAT
                            </span>
                        )}
                    </div>
                )}
                <span className="text-[16px] font-extrabold text-on-surface">{money(pricing.price)}</span>

                {stock !== undefined && stock !== null && (
                    <div className="mt-2 border-t border-outline-variant pt-2 text-[11px] font-medium">
                        {outOfStock ? (
                            <span className="font-bold text-warning">Out of stock</span>
                        ) : (
                            <span className="text-on-surface-variant">
                                Stock: <strong className="font-semibold text-on-surface">{stock.toLocaleString()}</strong>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </Link>
    );
}

// ======================== PAGE ========================

/**
 * The seller's Store tab (/dashboard, also /items): a dense two-column
 * catalogue of what this store carries, with search, barcode scan and
 * category pills. Pages in with infinite scroll.
 */
export default function Index({
    items: initialItems = [],
    nextPageUrl = null,
    filters = {},
    categories = [],
    has_tin_cart = false,
    top_cart_is_individual = false,
}: Props) {
    const [items, setItems] = React.useState(initialItems);
    const [hasNextPage, setHasNextPage] = React.useState(!!nextPageUrl);
    const [page, setPage] = React.useState(2);
    const [isLoading, setIsLoading] = React.useState(false);
    const [search, setSearch] = React.useState(filters.search ?? "");
    const [scannerOpen, setScannerOpen] = React.useState(false);
    const observerRef = React.useRef<HTMLDivElement | null>(null);
    const appendingRef = React.useRef(false);
    const categoryId = filters.category_id ?? null;

    // A fresh visit (search, category, back/forward) replaces the list; a
    // load-more response is appended in loadMore instead.
    React.useEffect(() => {
        if (appendingRef.current) {
            appendingRef.current = false;
            return;
        }
        setItems(initialItems);
        setHasNextPage(!!nextPageUrl);
        setPage(2);
    }, [initialItems, nextPageUrl]);

    const loadMore = React.useCallback(() => {
        if (isLoading || !hasNextPage) return;
        setIsLoading(true);
        appendingRef.current = true;
        router.get(
            route("seller.dashboard"),
            { page, search: filters.search || undefined, category_id: categoryId ?? undefined },
            {
                preserveState: true,
                preserveScroll: true,
                only: ["items", "nextPageUrl"],
                onSuccess: (resp) => {
                    const more = (resp.props.items as CatalogItem[] | undefined) ?? [];
                    setItems((prev) => [...prev, ...more]);
                    setHasNextPage(!!resp.props.nextPageUrl);
                    setPage((p) => p + 1);
                },
                onFinish: () => setIsLoading(false),
            },
        );
    }, [isLoading, hasNextPage, page, filters.search, categoryId]);

    React.useEffect(() => {
        if (!observerRef.current || !hasNextPage) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMore();
        }, { rootMargin: "100px" });
        observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, loadMore]);

    const runSearch = (query: string) => {
        if (!query.trim()) return;
        router.get(route("seller.items.search"), { search: query.trim() }, { preserveState: true });
    };

    const hints = React.useMemo(() => {
        const names = initialItems.slice(0, 4).map((i) => `Search '${i.product_name}'…`);
        return [...names, "Scan or type a barcode…"];
    }, [initialItems]);
    const { hint, visible } = useRotatingHint(hints);

    const pillClass = (active: boolean) =>
        `flex-shrink-0 whitespace-nowrap rounded-[999px] px-3 py-1 text-[12px] transition-colors ${
            active
                ? "bg-primary font-semibold tracking-wide text-on-primary shadow-sm"
                : "border border-outline-variant bg-surface-container-lowest font-medium text-on-surface-variant hover:bg-surface-container"
        }`;

    return (
        <>
            <Head title="Store" />

            {/* ========== HEADER: search + category pills ========== */}
            <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest/95 px-3.5 py-2.5 backdrop-blur-md">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        runSearch(search);
                    }}
                    className="relative flex items-center rounded-[999px] border border-outline-variant bg-surface-container-low py-1.5 pl-3.5 pr-1.5 shadow-inner transition-all focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/20"
                >
                    <span className="material-symbols-outlined mr-2 flex-shrink-0 text-[20px] text-outline">search</span>
                    <div className="relative flex h-[22px] w-full items-center overflow-hidden">
                        <input
                            aria-label="Search catalogue"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="absolute inset-0 z-10 h-full w-full border-0 bg-transparent p-0 text-[13px] font-medium text-on-surface focus:outline-none focus:ring-0"
                        />
                        {!search && (
                            <span
                                aria-hidden
                                className={`pointer-events-none select-none truncate text-[13px] font-medium text-on-surface-variant transition duration-300 motion-reduce:transition-none ${
                                    visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                                }`}
                            >
                                {hint}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        title="Scan barcode / QR"
                        onClick={() => setScannerOpen(true)}
                        className="flex flex-shrink-0 items-center justify-center rounded-[999px] p-1.5 text-on-surface-variant transition-colors hover:text-on-surface active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
                    </button>
                    <button
                        type="submit"
                        aria-label="Search"
                        className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[999px] bg-primary text-on-primary shadow-sm transition-all hover:bg-primary/90 active:scale-90"
                    >
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                </form>

                {categories.length > 0 && (
                    <nav
                        aria-label="Product categories"
                        className="-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 pb-0.5 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        <Link href={route("seller.dashboard")} preserveScroll className={pillClass(categoryId === null)}>
                            All categories
                        </Link>
                        {categories.map((c) => (
                            <Link
                                key={c.id}
                                href={route("seller.dashboard", { category_id: c.id })}
                                preserveScroll
                                className={pillClass(categoryId === c.id)}
                            >
                                {c.name}
                            </Link>
                        ))}
                    </nav>
                )}
            </header>

            {/* ========== CATALOGUE GRID ========== */}
            <main className="space-y-3.5 px-3 pt-3">
                {items.length > 0 ? (
                    <section aria-label="Products" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                        {items.map((item) => (
                            <ProductCard key={item.id} item={item} hasTinCart={has_tin_cart} topCartIsIndividual={top_cart_is_individual} />
                        ))}
                    </section>
                ) : (
                    !isLoading && (
                        <EmptyState
                            framed
                            icon="inventory_2"
                            title="No items found"
                            description={filters.search || categoryId ? "Try another search or category." : "This store has no active items yet."}
                        />
                    )
                )}

                {isLoading && (
                    <div className="flex justify-center py-4">
                        <span className="h-6 w-6 animate-spin rounded-[999px] border-2 border-primary/30 border-t-primary" />
                    </div>
                )}
                {hasNextPage && items.length > 0 && <div ref={observerRef} className="h-5" />}
                {!hasNextPage && items.length > 0 && (
                    <footer className="py-4 text-center">
                        <span className="inline-flex items-center gap-2 rounded-[999px] border border-outline-variant bg-surface-container px-4 py-1.5 text-[12px] font-medium text-on-surface-variant">
                            <span className="material-symbols-outlined text-[16px] text-outline">sports_score</span>
                            Showing all {items.length} {items.length === 1 ? "item" : "items"}
                        </span>
                    </footer>
                )}
            </main>

            <BarcodeScannerDialog
                open={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScan={(text) => {
                    setScannerOpen(false);
                    router.get(route("seller.items.search"), { search: text });
                }}
            />
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
