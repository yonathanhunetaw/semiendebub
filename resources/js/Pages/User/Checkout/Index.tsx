import React from "react";
import { Head, Link, useForm } from "@inertiajs/react";
import ShopPageLayout from "@/Layouts/ShopPageLayout";
import { SkButton, SkCard, SkCardHeader, SkField, inputClass } from "@/Components/StockKeeper/skKit";
import { birr } from "@/Components/Shared/OrderView";
import type { CheckoutPageProps } from "@/types/storefront";

interface CheckoutForm {
    /** store id → the account chosen for it, as a string ("" = none yet). */
    accounts: Record<number, string>;
    delivery_method: "courier" | "store";
    delivery_address: string;
    recipient_name: string;
    recipient_phone: string;
    delay_agreed: boolean;
    notes: string;
}

/** "2880" minutes as the shopper reads it. */
function holdText(minutes: number): string {
    if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
    return `${minutes} minutes`;
}

/**
 * The online shop's checkout: each store in the basket becomes its own order,
 * paid by transfer into the account chosen for it; one way to get it for all.
 */
export default function CheckoutIndex({ stores = [], recipient, hold_minutes, delay_agreed = false }: CheckoutPageProps) {
    const { data, setData, post, processing, errors, transform } = useForm<CheckoutForm>({
        accounts: Object.fromEntries(stores.map((s) => [s.store.id, s.accounts.length === 1 ? String(s.accounts[0].id) : ""])),
        delivery_method: "courier",
        delivery_address: recipient?.address ?? "",
        recipient_name: recipient?.name ?? "",
        recipient_phone: recipient?.phone ?? "",
        delay_agreed,
        notes: "",
    });
    const err = errors as Record<string, string | undefined>;

    transform((d) => ({
        stores: stores.map((s) => ({ store_id: s.store.id, payment_account_id: d.accounts[s.store.id] ? Number(d.accounts[s.store.id]) : null })),
        delivery_method: d.delivery_method,
        delivery_address: d.delivery_method === "courier" ? d.delivery_address : null,
        recipient_name: d.recipient_name,
        recipient_phone: d.recipient_phone,
        delay_agreed: d.delay_agreed,
        notes: d.notes,
    }));

    const total = stores.reduce((sum, s) => sum + s.total, 0);
    const needsDelay = stores.some((s) => s.requires_delay_agreement);
    const noAccounts = stores.filter((s) => s.accounts.length === 0);
    const unchosen = stores.some((s) => !data.accounts[s.store.id]);
    const many = stores.length > 1;
    const accountError = Object.entries(err).find(([key]) => key.startsWith("stores"))?.[1];

    return (
        <>
            <Head title="Checkout" />

            <h1 className="text-[22px] font-extrabold tracking-tight">Checkout</h1>
            <p className="mb-4 text-[13px] text-on-surface-variant">
                {many ? `${stores.length} stores, so ${stores.length} orders, each paid to its own store. ` : ""}
                You pay by bank or wallet transfer after placing the order. We hold your items for {holdText(hold_minutes)} while you pay.
            </p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    post(route("storefront.checkout.place"), { preserveScroll: true });
                }}
            >
                {stores.map((s) => (
                    <SkCard key={s.store.id} className="mb-4">
                        <SkCardHeader icon="storefront" title={s.store.name} right={<span className="text-[15px] font-extrabold tabular-nums">{birr(s.total)}</span>} />
                        <ul className="divide-y divide-outline-variant/60">
                            {s.lines.map((l) => (
                                <li key={l.variant_id} className="flex items-center gap-3 px-4 py-2.5">
                                    {l.image_url ? <img src={l.image_url} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" /> : null}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[14px] font-bold">
                                            {l.quantity} × {l.title}
                                        </span>
                                        <span className="block truncate text-[12px] text-on-surface-variant">
                                            {[l.detail, l.extra_pieces > 0 ? `+ ${l.extra_pieces} loose` : null].filter(Boolean).join(" · ")}
                                        </span>
                                    </span>
                                    <span className="text-[14px] font-bold tabular-nums">{birr(l.line_total)}</span>
                                </li>
                            ))}
                        </ul>
                        {s.requires_delay_agreement ? (
                            <p className="border-t border-outline-variant/70 px-4 py-2 text-[12px] font-bold text-warning">
                                {s.delayed_line_count} item{s.delayed_line_count === 1 ? "" : "s"} come{s.delayed_line_count === 1 ? "s" : ""} from our warehouse and arrive later.
                            </p>
                        ) : null}

                        <div className="space-y-2 border-t border-outline-variant/70 p-4">
                            <p className="text-[13px] font-bold">Pay {birr(s.total)} into</p>
                            {s.accounts.length === 0 ? <p className="text-[13px] font-bold text-warning">This store has no account set up for transfers yet. Remove its items or try again later.</p> : null}
                            {s.accounts.map((a) => {
                                const chosen = data.accounts[s.store.id] === String(a.id);
                                return (
                                    <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-2.5 ${chosen ? "border-primary bg-primary-container/40" : "border-outline-variant"}`}>
                                        <input
                                            type="radio"
                                            name={`account-${s.store.id}`}
                                            className="text-primary focus:ring-0"
                                            checked={chosen}
                                            onChange={() => setData("accounts", { ...data.accounts, [s.store.id]: String(a.id) })}
                                        />
                                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">{a.type === "wallet" ? "smartphone" : "account_balance"}</span>
                                        <span className="min-w-0">
                                            <span className="block text-[14px] font-bold">{a.provider}</span>
                                            <span className="block truncate text-[12px] text-on-surface-variant">
                                                {a.account_name} · {a.account_number}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </SkCard>
                ))}

                <SkCard className="mb-4">
                    <SkCardHeader icon="local_shipping" title="How you get it" />
                    <div className="space-y-4 p-4">
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you get it">
                            {(
                                [
                                    ["courier", "Deliver to me", "two_wheeler"],
                                    ["store", many ? "I'll pick them up" : "I'll pick it up", "storefront"],
                                ] as const
                            ).map(([value, label, icon]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={data.delivery_method === value}
                                    onClick={() => setData("delivery_method", value)}
                                    className={`flex items-center justify-center gap-2 rounded-[14px] border px-3 py-3 text-[14px] font-bold ${data.delivery_method === value ? "border-primary bg-primary-container/50 text-primary" : "border-outline-variant"}`}
                                >
                                    <span className="material-symbols-outlined text-[20px]">{icon}</span>
                                    {label}
                                </button>
                            ))}
                        </div>

                        {data.delivery_method === "courier" ? (
                            <>
                                <SkField label="Address" error={err.delivery_address}>
                                    <textarea className={inputClass} rows={2} value={data.delivery_address} onChange={(e) => setData("delivery_address", e.target.value)} placeholder="Area, street, building, what is near" />
                                </SkField>
                                <p className="text-[12px] text-on-surface-variant">The store tells you the delivery fee when it sends the order.</p>
                            </>
                        ) : needsDelay ? (
                            <p className="text-[13px] font-bold text-warning">Some items are not in the store today, so they cannot be picked up now. Choose delivery.</p>
                        ) : (
                            <p className="text-[13px] text-on-surface-variant">
                                Collect {many ? "each order at its store" : `it at ${stores[0]?.store.name ?? "the store"}`} once it is paid and packed. Bring the order number.
                            </p>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <SkField label={data.delivery_method === "courier" ? "Who receives it" : "Who collects it"} error={err.recipient_name}>
                                <input className={inputClass} value={data.recipient_name} onChange={(e) => setData("recipient_name", e.target.value)} autoComplete="name" />
                            </SkField>
                            <SkField label="Phone" error={err.recipient_phone}>
                                <input className={inputClass} inputMode="tel" value={data.recipient_phone} onChange={(e) => setData("recipient_phone", e.target.value)} autoComplete="tel" />
                            </SkField>
                        </div>

                        {needsDelay ? (
                            <label className="flex items-start gap-2 text-[14px]">
                                <input type="checkbox" className="mt-1 rounded-[4px] border-outline-variant text-primary focus:ring-0" checked={data.delay_agreed} onChange={(e) => setData("delay_agreed", e.target.checked)} />
                                <span>Some items come from our warehouse and arrive later. I agree to wait for them.</span>
                            </label>
                        ) : null}

                        <SkField label="A note for the store (optional)" error={err.notes}>
                            <input className={inputClass} value={data.notes} onChange={(e) => setData("notes", e.target.value)} maxLength={500} />
                        </SkField>
                    </div>
                </SkCard>

                {accountError ? <p className="mb-3 text-[13px] font-bold text-error">{accountError}</p> : null}

                <SkButton
                    type="submit"
                    icon="check_circle"
                    loading={processing}
                    className="w-full py-3.5 text-[16px]"
                    disabled={noAccounts.length > 0 || unchosen || (needsDelay && !data.delay_agreed) || (data.delivery_method === "store" && needsDelay)}
                >
                    {many ? `Place ${stores.length} orders` : "Place order"} · {birr(total)}
                </SkButton>
                {unchosen && noAccounts.length === 0 ? <p className="mt-2 text-center text-[12px] text-on-surface-variant">Choose an account to pay into{many ? " for every store" : ""}.</p> : null}

                <p className="mt-4 text-center text-[13px]">
                    <Link href={route("storefront.index")} className="font-bold text-primary">
                        Back to the shop
                    </Link>
                </p>
            </form>
        </>
    );
}

CheckoutIndex.layout = (page: React.ReactElement<CheckoutPageProps>) => <ShopPageLayout title="Checkout">{page}</ShopPageLayout>;
