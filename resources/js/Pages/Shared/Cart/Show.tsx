import React from "react";
import { Head, router, useForm } from "@inertiajs/react";
import SharedCartLayout from "@/Layouts/SharedCartLayout";
import { StatusPill } from "@/Components/Shared/ui";
import { SkButton, SkCard, SkCardHeader, SkField, inputClass } from "@/Components/StockKeeper/skKit";
import type { Availability, CatalogueItem, SharedCart } from "@/types/sharedCart";

interface Props {
    token: string;
    cart: SharedCart;
}

const birr = (n: number) => `ETB ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

function AvailabilityPill({ a }: { a: Availability }) {
    const tone = a.state === "now" ? "success" : a.state === "later" ? "warning" : "error";
    return <StatusPill label={a.text} tone={tone} size="sm" />;
}

/** Type to find something else in the store; each result is priced for this customer. */
function AddItems({ token }: { token: string }) {
    const [q, setQ] = React.useState("");
    const [items, setItems] = React.useState<CatalogueItem[]>([]);
    const [busy, setBusy] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (q.trim().length < 2) {
            setItems([]);
            return;
        }
        const controller = new AbortController();
        const t = window.setTimeout(() => {
            fetch(route("shared.cart.catalogue", { token, q }), { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, signal: controller.signal })
                .then((r) => r.json())
                .then((body: { items: CatalogueItem[] }) => setItems(body.items))
                .catch(() => undefined);
        }, 300);
        return () => {
            window.clearTimeout(t);
            controller.abort();
        };
    }, [q, token]);

    const add = (item: CatalogueItem) => {
        setBusy(item.variant_id);
        router.post(route("shared.cart.items.store", token), { variant_id: item.variant_id, quantity: 1 }, { preserveScroll: true, onFinish: () => setBusy(null) });
    };

    return (
        <SkCard className="mb-4">
            <SkCardHeader icon="add_shopping_cart" title="Add something else" />
            <div className="p-4">
                <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the store…" aria-label="Search the store" />
                {items.length > 0 ? (
                    <ul className="mt-3 divide-y divide-outline-variant/60">
                        {items.map((i) => (
                            <li key={i.variant_id} className="flex items-center justify-between gap-3 py-2.5">
                                <span className="min-w-0">
                                    <span className="block truncate text-[14px] font-bold">{i.title}</span>
                                    <span className="block truncate text-[12px] text-on-surface-variant">
                                        {[i.detail, `per ${i.unit}`].filter(Boolean).join(" · ")} · {i.in_stock ? "in stock" : "ask the store"}
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                    <span className="text-[14px] font-bold tabular-nums">{birr(i.unit_price)}</span>
                                    <SkButton variant="outline" icon="add" className="px-3 py-2" disabled={busy === i.variant_id} onClick={() => add(i)} aria-label={`Add ${i.title}`}>
                                        Add
                                    </SkButton>
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : q.trim().length >= 2 ? (
                    <p className="mt-3 text-[13px] text-on-surface-variant">Nothing found.</p>
                ) : null}
            </div>
        </SkCard>
    );
}

interface CheckoutForm {
    delivery_method: "courier" | "store";
    customer_address_id: string;
    delivery_address: string;
    recipient_name: string;
    recipient_phone: string;
    payment_account_id: string;
    delay_agreed: boolean;
    notes: string;
}

/** A cart a seller prepared for this customer: change it, then check out. */
export default function SharedCartShow({ token, cart }: Props) {
    const firstAddress = cart.addresses[0];
    const { data, setData, post, processing, errors, transform } = useForm<CheckoutForm>({
        delivery_method: "courier",
        customer_address_id: firstAddress ? String(firstAddress.id) : "",
        delivery_address: firstAddress?.address ?? "",
        recipient_name: firstAddress?.recipient_name ?? cart.recipient.name ?? "",
        recipient_phone: firstAddress?.recipient_phone ?? cart.recipient.phone ?? "",
        payment_account_id: cart.accounts.length === 1 ? String(cart.accounts[0].id) : "",
        delay_agreed: false,
        notes: "",
    });
    const err = errors as Record<string, string | undefined>;

    transform((d) => ({ ...d, customer_address_id: d.customer_address_id ? Number(d.customer_address_id) : null }));

    const setQuantity = (variantId: number, quantity: number) =>
        router.patch(route("shared.cart.items.update", [token, variantId]), { quantity }, { preserveScroll: true });

    const pickAddress = (id: string) => {
        const a = cart.addresses.find((x) => String(x.id) === id);
        setData((d) => ({ ...d, customer_address_id: id, delivery_address: a?.address ?? "", recipient_name: a?.recipient_name ?? d.recipient_name, recipient_phone: a?.recipient_phone ?? d.recipient_phone }));
    };

    const unavailable = cart.lines.some((l) => l.availability.state === "unavailable");
    const pickupBlocked = cart.lines.some((l) => l.availability.state !== "now");
    const expires = new Date(cart.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });

    return (
        <>
            <Head title="Your cart" />

            <h1 className="text-[22px] font-extrabold tracking-tight">{cart.customer ? `${cart.customer}, here is your cart` : "Your cart"}</h1>
            <p className="mb-4 text-[13px] text-on-surface-variant">
                {cart.seller ? `Prepared by ${cart.seller}. ` : ""}Prices are yours. Change quantities, add more, then place the order. This link works until {expires}.
            </p>

            <SkCard className="mb-4">
                <SkCardHeader icon="shopping_cart" title="Items" right={<span className="text-[15px] font-extrabold tabular-nums">{birr(cart.total)}</span>} />
                {cart.lines.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[14px] text-on-surface-variant">Your cart is empty. Add something below.</p>
                ) : (
                    <ul className="divide-y divide-outline-variant/60">
                        {cart.lines.map((l) => (
                            <li key={l.variant_id} className="flex gap-3 px-4 py-3">
                                {l.image_url ? <img src={l.image_url} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" /> : null}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-bold">{l.title}</p>
                                    <p className="truncate text-[12px] text-on-surface-variant">{[l.detail, `${birr(l.unit_price)} per ${l.unit}`].filter(Boolean).join(" · ")}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${l.title}`}>
                                            <button type="button" onClick={() => setQuantity(l.variant_id, l.quantity - 1)} aria-label="One less" className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-outline-variant">
                                                <span className="material-symbols-outlined text-[18px]">{l.quantity <= 1 ? "delete" : "remove"}</span>
                                            </button>
                                            <span className="w-10 text-center text-[15px] font-bold tabular-nums">{l.quantity}</span>
                                            <button type="button" onClick={() => setQuantity(l.variant_id, l.quantity + 1)} aria-label="One more" className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-outline-variant">
                                                <span className="material-symbols-outlined text-[18px]">add</span>
                                            </button>
                                        </div>
                                        <AvailabilityPill a={l.availability} />
                                        <span className="text-[15px] font-extrabold tabular-nums">{birr(l.line_total)}</span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </SkCard>

            <AddItems token={token} />

            {cart.lines.length > 0 ? (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        post(route("shared.cart.checkout", token), { preserveScroll: true });
                    }}
                >
                    <SkCard className="mb-4">
                        <SkCardHeader icon="local_shipping" title="How you get it" />
                        <div className="space-y-4 p-4">
                            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you get it">
                                {(
                                    [
                                        ["courier", "Deliver to me", "two_wheeler"],
                                        ["store", "I'll pick it up", "storefront"],
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
                                    {cart.addresses.length > 0 ? (
                                        <SkField label="Saved address">
                                            <select className={inputClass} value={data.customer_address_id} onChange={(e) => pickAddress(e.target.value)}>
                                                {cart.addresses.map((a) => (
                                                    <option key={a.id} value={a.id}>
                                                        {a.label ? `${a.label}: ` : ""}
                                                        {a.address}
                                                    </option>
                                                ))}
                                                <option value="">A new address</option>
                                            </select>
                                        </SkField>
                                    ) : null}
                                    <SkField label="Address" error={err.delivery_address}>
                                        <textarea className={inputClass} rows={2} value={data.delivery_address} onChange={(e) => setData((d) => ({ ...d, delivery_address: e.target.value, customer_address_id: "" }))} />
                                    </SkField>
                                    <div className="grid grid-cols-2 gap-3">
                                        <SkField label="Who receives it" error={err.recipient_name}>
                                            <input className={inputClass} value={data.recipient_name} onChange={(e) => setData("recipient_name", e.target.value)} />
                                        </SkField>
                                        <SkField label="Phone" error={err.recipient_phone}>
                                            <input className={inputClass} inputMode="tel" value={data.recipient_phone} onChange={(e) => setData("recipient_phone", e.target.value)} />
                                        </SkField>
                                    </div>
                                    <p className="text-[12px] text-on-surface-variant">The store tells you the delivery fee when it sends the order.</p>
                                </>
                            ) : pickupBlocked ? (
                                <p className="text-[13px] font-bold text-warning">Some items are not in the store today, so they cannot be picked up now. Choose delivery.</p>
                            ) : (
                                <p className="text-[13px] text-on-surface-variant">Collect it at {cart.store ?? "the store"} once it is paid and packed.</p>
                            )}

                            {cart.requires_delay_agreement ? (
                                <label className="flex items-start gap-2 text-[14px]">
                                    <input type="checkbox" className="mt-1 rounded-[4px] border-outline-variant text-primary focus:ring-0" checked={data.delay_agreed} onChange={(e) => setData("delay_agreed", e.target.checked)} />
                                    <span>Some items come from our warehouse and arrive later. I agree to wait for them.</span>
                                </label>
                            ) : null}
                        </div>
                    </SkCard>

                    <SkCard className="mb-4">
                        <SkCardHeader icon="account_balance" title="How you pay" />
                        <div className="space-y-2 p-4">
                            <p className="text-[13px] text-on-surface-variant">By bank or wallet transfer. Choose the account; after placing the order you send {birr(cart.total)} and tell us the reference.</p>
                            {cart.accounts.length === 0 ? <p className="text-[13px] font-bold text-warning">The store has no account set up for transfers. Contact your seller.</p> : null}
                            {cart.accounts.map((a) => (
                                <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-2.5 ${data.payment_account_id === String(a.id) ? "border-primary bg-primary-container/40" : "border-outline-variant"}`}>
                                    <input type="radio" name="account" className="text-primary focus:ring-0" checked={data.payment_account_id === String(a.id)} onChange={() => setData("payment_account_id", String(a.id))} />
                                    <span className="min-w-0">
                                        <span className="block text-[14px] font-bold">{a.provider}</span>
                                        <span className="block text-[12px] text-on-surface-variant">
                                            {a.account_name} · {a.account_number}
                                        </span>
                                    </span>
                                </label>
                            ))}
                            {err.payment_account_id ? <p className="text-[12px] text-error">{err.payment_account_id}</p> : null}
                            <SkField label="A note for the store (optional)">
                                <input className={inputClass} value={data.notes} onChange={(e) => setData("notes", e.target.value)} />
                            </SkField>
                        </div>
                    </SkCard>

                    {unavailable ? <p className="mb-3 text-[13px] font-bold text-error">Some items are not in stock in this quantity. Lower the quantity or remove them.</p> : null}

                    <SkButton
                        type="submit"
                        icon="check_circle"
                        className="w-full py-3.5 text-[16px]"
                        disabled={processing || cart.accounts.length === 0 || (cart.requires_delay_agreement && !data.delay_agreed) || (data.delivery_method === "store" && pickupBlocked)}
                    >
                        Place order · {birr(cart.total)}
                    </SkButton>
                </form>
            ) : null}
        </>
    );
}

SharedCartShow.layout = (page: React.ReactElement<Props>) => <SharedCartLayout store={page.props.cart?.store}>{page}</SharedCartLayout>;
