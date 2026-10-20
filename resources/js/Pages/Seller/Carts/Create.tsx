import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, router, useForm } from "@inertiajs/react";
import React, { useMemo, useState } from "react";

/**
 * Start a cart: pick who it is for, or none for a walk-in.
 *
 * The customer decides the prices the cart is quoted at (their own prices,
 * individual vs business, credit at checkout), so the choice is made here,
 * with each customer's type and credit in view. Saving opens the new cart
 * on the cart console.
 *
 * Radii are explicit: tailwind.config.js redefines `rounded-full` to 0.75rem.
 */

interface CustomerOption {
    id: number;
    name: string;
    phone: string | null;
    city: string | null;
    type: "individual" | "business";
    tin_number: string | null;
    has_credit: boolean;
    /** Carts this customer has had. */
    carts: number;
}

interface Props {
    customers?: CustomerOption[];
    store?: string | null;
    open_carts?: number;
}

type Filter = "all" | "individual" | "business" | "credit";

const FILTERS: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "individual", label: "Individual" },
    { id: "business", label: "Business" },
    { id: "credit", label: "On credit" },
];

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?";

export default function Create({ customers = [], store = null, open_carts = 0 }: Props): React.ReactElement {
    const { data, setData, post, processing, errors } = useForm<{ customer_id: number | "" }>({ customer_id: "" });
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");

    const visible = useMemo(() => {
        const term = query.trim().toLowerCase();

        return customers.filter((customer) => {
            if (filter === "credit" && !customer.has_credit) return false;
            if ((filter === "individual" || filter === "business") && customer.type !== filter) return false;
            if (!term) return true;

            return [customer.name, customer.phone, customer.city, customer.tin_number]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        });
    }, [customers, query, filter]);

    const chosen = customers.find((customer) => customer.id === data.customer_id) ?? null;

    const submit = () => post(route("seller.carts.store"));

    return (
        <>
            <Head title="New cart" />

            <div className="min-h-screen bg-background pb-[180px]">
                {/* ── Header ── */}
                <header className="sticky top-0 z-30 border-b border-outline-variant/60 bg-surface-container-lowest shadow-sm">
                    <div className="flex h-12 items-center justify-between px-4">
                        <button
                            type="button"
                            onClick={() => router.visit(route("seller.carts.index"))}
                            aria-label="Back to carts"
                            className="-ml-1 p-1 text-on-surface"
                        >
                            <span className="material-symbols-outlined text-[22px]">chevron_left</span>
                        </button>
                        <h1 className="text-base font-bold tracking-tight text-on-surface">New cart</h1>
                        <Link
                            href={route("seller.customers.create")}
                            aria-label="Add a customer"
                            className="p-1 text-on-surface-variant active:scale-90"
                        >
                            <span className="material-symbols-outlined text-[22px]">person_add</span>
                        </Link>
                    </div>

                    <div className="px-4 pb-3">
                        <label className="flex items-center gap-2 rounded-[999px] border border-outline-variant bg-surface-container-low px-3 py-2">
                            <span className="material-symbols-outlined text-[18px] text-outline">search</span>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Name, phone, city or TIN"
                                className="w-full border-0 bg-transparent p-0 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-0"
                            />
                            {query ? (
                                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-outline">
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            ) : null}
                        </label>

                        <div className="mt-2 flex gap-1.5 overflow-x-auto">
                            {FILTERS.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => setFilter(entry.id)}
                                    className={`shrink-0 rounded-[999px] border px-3 py-1 text-[11px] font-semibold transition-colors ${
                                        filter === entry.id
                                            ? "border-primary bg-primary text-on-primary"
                                            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                                    }`}
                                >
                                    {entry.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <main className="mx-auto max-w-md space-y-2.5 px-0 pt-2 sm:px-2">
                    {/* ── Where the cart sells from ── */}
                    <section className="flex items-center gap-3 bg-surface-container-lowest px-4 py-3 shadow-sm sm:rounded-[12px]">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[999px] bg-primary-container text-primary">
                            <span className="material-symbols-outlined text-[20px]">storefront</span>
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-on-surface">{store ?? "Your store"}</p>
                            <p className="text-[11px] text-on-surface-variant">
                                Priced and held from this store · {open_carts} open cart{open_carts === 1 ? "" : "s"}
                            </p>
                        </div>
                    </section>

                    {/* ── Who it is for ── */}
                    <section className="bg-surface-container-lowest p-4 shadow-sm sm:rounded-[12px]">
                        <h2 className="text-base font-bold text-on-surface">Who is this cart for?</h2>
                        <p className="mt-0.5 text-xs text-on-surface-variant">
                            Their own prices and credit apply at checkout.
                        </p>

                        <div className="mt-3 space-y-2">
                            <CustomerRow
                                selected={data.customer_id === ""}
                                onSelect={() => setData("customer_id", "")}
                                icon="directions_walk"
                                title="Walk-in customer"
                                subtitle="No customer record · individual prices"
                            />

                            {visible.map((customer) => (
                                <CustomerRow
                                    key={customer.id}
                                    selected={data.customer_id === customer.id}
                                    onSelect={() => setData("customer_id", customer.id)}
                                    initials={initials(customer.name)}
                                    title={customer.name}
                                    subtitle={[customer.phone, customer.city].filter(Boolean).join(" · ") || "No phone saved"}
                                    chips={
                                        <>
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                                    customer.type === "individual"
                                                        ? "bg-info-container text-on-info-container"
                                                        : "bg-secondary-container text-on-secondary-container"
                                                }`}
                                            >
                                                {customer.type === "individual" ? "Individual" : "Business"}
                                            </span>
                                            {customer.has_credit ? (
                                                <span className="rounded bg-success-container px-1.5 py-0.5 text-[10px] font-bold text-on-success-container">
                                                    Credit
                                                </span>
                                            ) : null}
                                            {customer.carts > 0 ? (
                                                <span className="text-[10px] text-outline">{customer.carts} cart{customer.carts === 1 ? "" : "s"} before</span>
                                            ) : null}
                                        </>
                                    }
                                />
                            ))}

                            {visible.length === 0 ? (
                                <div className="rounded-[12px] border border-dashed border-outline-variant px-4 py-8 text-center">
                                    <span className="material-symbols-outlined text-[32px] text-outline">person_search</span>
                                    <p className="mt-1 text-[13px] font-bold text-on-surface">No customer matches</p>
                                    <Link
                                        href={route("seller.customers.create")}
                                        className="mt-3 inline-flex items-center gap-1 rounded-[999px] bg-primary px-4 py-2 text-xs font-bold text-on-primary"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">person_add</span>
                                        Add a customer
                                    </Link>
                                </div>
                            ) : null}
                        </div>

                        {errors.customer_id ? <p className="mt-2 text-[11px] text-error">{errors.customer_id}</p> : null}
                    </section>
                </main>
            </div>

            {/* ── Sticky action bar: on the bottom nav, on the bottom edge while it hides ── */}
            <aside className="dock-sheet fixed inset-x-0 z-40 mx-auto max-w-[480px] rounded-t-[16px] border-t border-outline-variant bg-surface-container-lowest px-3 pt-3 shadow-[0_-4px_16px_rgb(var(--on-surface)/0.08)] [--dock-pad:0.75rem] dark:shadow-none">
                <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                    <div className="min-w-0">
                        <span className="block text-[11px] text-on-surface-variant">Cart for</span>
                        <span className="block truncate text-sm font-bold text-on-surface">
                            {chosen ? chosen.name : "Walk-in customer"}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={processing}
                        className="flex max-w-[200px] flex-1 items-center justify-center gap-1.5 rounded-[999px] bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-md transition-transform active:scale-[0.98] disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                        {processing ? "Starting…" : "Start cart"}
                    </button>
                </div>
            </aside>
        </>
    );
}

function CustomerRow({
    selected,
    onSelect,
    title,
    subtitle,
    icon,
    initials: letters,
    chips,
}: {
    selected: boolean;
    onSelect: () => void;
    title: string;
    subtitle: string;
    icon?: string;
    initials?: string;
    chips?: React.ReactNode;
}): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={`flex w-full items-center gap-3 rounded-[12px] border p-2.5 text-left transition-colors ${
                selected ? "border-primary bg-primary-container/25" : "border-outline-variant hover:bg-surface-container-low/60"
            }`}
        >
            <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[999px] text-sm font-bold ${
                    selected ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"
                }`}
            >
                {icon ? <span className="material-symbols-outlined text-[20px]">{icon}</span> : letters}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-on-surface">{title}</span>
                <span className="block truncate text-[11px] text-on-surface-variant">{subtitle}</span>
                {chips ? <span className="mt-1 flex flex-wrap items-center gap-1">{chips}</span> : null}
            </span>
            <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[999px] border ${
                    selected ? "border-primary bg-primary text-on-primary" : "border-outline/50"
                }`}
            >
                {selected ? <span className="material-symbols-outlined text-[13px]">check</span> : null}
            </span>
        </button>
    );
}

Create.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
