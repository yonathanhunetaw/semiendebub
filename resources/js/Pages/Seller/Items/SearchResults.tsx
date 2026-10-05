import { Head, Link, router } from "@inertiajs/react";
import React from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { type CatalogItem } from "@/Components/Seller/catalogPricing";
import ProductCard from "@/Components/Seller/ProductCard";
import { EmptyState } from "@/Components/Shared/ui";

interface Props {
    query?: string;
    items?: CatalogItem[];
    nextPageUrl?: string | null;
    /** Categories among every match, for the filter pills. */
    categories?: { id: number; category_name: string }[];
    selectedCategoryId?: number | null;
    has_tin_cart?: boolean;
    top_cart_is_individual?: boolean;
}

/**
 * Seller search results: the Store page's cards and pricing (the same cart
 * decides individual vs business, so VAT reads the same), filtered by the
 * query and an optional category. Pages in with infinite scroll.
 */
export default function SearchResults({
    query = "",
    items: initialItems = [],
    nextPageUrl = null,
    categories = [],
    selectedCategoryId = null,
    has_tin_cart = false,
    top_cart_is_individual = false,
}: Props) {
    const [items, setItems] = React.useState(initialItems);
    const [hasNextPage, setHasNextPage] = React.useState(!!nextPageUrl);
    const [page, setPage] = React.useState(2);
    const [isLoading, setIsLoading] = React.useState(false);
    const [search, setSearch] = React.useState(query);
    const observerRef = React.useRef<HTMLDivElement | null>(null);
    const appendingRef = React.useRef(false);

    // A fresh search or category replaces the list; load-more appends below.
    React.useEffect(() => {
        if (appendingRef.current) {
            appendingRef.current = false;
            return;
        }
        setItems(initialItems);
        setHasNextPage(!!nextPageUrl);
        setPage(2);
    }, [initialItems, nextPageUrl]);

    React.useEffect(() => setSearch(query), [query]);

    const visit = (next: { search?: string; category_id?: number | null }) =>
        router.get(route("seller.items.search"), {
            search: (next.search ?? query) || undefined,
            category_id: (next.category_id === undefined ? selectedCategoryId : next.category_id) ?? undefined,
        });

    const loadMore = React.useCallback(() => {
        if (isLoading || !hasNextPage) return;
        setIsLoading(true);
        appendingRef.current = true;
        router.get(
            route("seller.items.search"),
            { search: query || undefined, category_id: selectedCategoryId ?? undefined, page },
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
    }, [isLoading, hasNextPage, page, query, selectedCategoryId]);

    React.useEffect(() => {
        if (!observerRef.current || !hasNextPage) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMore();
        }, { rootMargin: "100px" });
        observer.observe(observerRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, loadMore]);

    const pillClass = (active: boolean) =>
        `flex-shrink-0 whitespace-nowrap rounded-[999px] px-3 py-1 text-[12px] transition-colors ${
            active
                ? "bg-primary font-semibold tracking-wide text-on-primary shadow-sm"
                : "border border-outline-variant bg-surface-container-lowest font-medium text-on-surface-variant hover:bg-surface-container"
        }`;

    return (
        <>
            <Head title={query ? `Search: ${query}` : "Search"} />

            <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest/95 px-3.5 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <Link
                        href={route("seller.dashboard")}
                        aria-label="Back to store"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[999px] text-on-surface-variant hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                    </Link>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (search.trim()) visit({ search: search.trim(), category_id: null });
                        }}
                        className="flex flex-1 items-center rounded-[999px] border border-outline-variant bg-surface-container-low py-1.5 pl-3.5 pr-1.5 shadow-inner transition-all focus-within:border-primary focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/20"
                    >
                        <span className="material-symbols-outlined mr-2 flex-shrink-0 text-[20px] text-outline">search</span>
                        <input
                            aria-label="Search catalogue"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search products…"
                            className="h-[22px] w-full border-0 bg-transparent p-0 text-[13px] font-medium text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-0"
                        />
                        <button
                            type="submit"
                            aria-label="Search"
                            className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[999px] bg-primary text-on-primary shadow-sm transition-all hover:bg-primary/90 active:scale-90"
                        >
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </button>
                    </form>
                </div>

                {categories.length > 0 && (
                    <nav
                        aria-label="Filter by category"
                        className="-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 pb-0.5 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        <button type="button" onClick={() => visit({ category_id: null })} className={pillClass(selectedCategoryId === null)}>
                            All categories
                        </button>
                        {categories.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => visit({ category_id: c.id })}
                                className={pillClass(selectedCategoryId === c.id)}
                            >
                                {c.category_name}
                            </button>
                        ))}
                    </nav>
                )}
            </header>

            <main className="space-y-3.5 px-3 pt-3">
                {query && (
                    <p className="px-0.5 text-[12px] font-medium text-on-surface-variant">
                        Results for <span className="font-semibold text-on-surface">“{query}”</span>
                    </p>
                )}

                {items.length > 0 ? (
                    <section aria-label="Search results" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                        {items.map((item) => (
                            <ProductCard key={item.id} item={item} hasTinCart={has_tin_cart} topCartIsIndividual={top_cart_is_individual} />
                        ))}
                    </section>
                ) : (
                    !isLoading && (
                        <EmptyState
                            framed
                            icon="search_off"
                            title="No matching items"
                            description="Try a different name, or clear the category filter."
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
                            {items.length} {items.length === 1 ? "match" : "matches"}
                        </span>
                    </footer>
                )}
            </main>
        </>
    );
}

SearchResults.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
