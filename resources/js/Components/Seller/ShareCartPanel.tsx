import React from "react";
import { router } from "@inertiajs/react";
import { StatusPill, type Tone } from "@/Components/Shared/ui";

export interface CartShareInfo {
    url: string;
    stage: "sent" | "opened" | "editing" | "checked_out" | "revoked" | "expired";
    expires_at: string;
    opened_at: string | null;
    last_seen_at: string | null;
    customer_edited_at: string | null;
}

const STAGE: Record<CartShareInfo["stage"], { label: string; tone: Tone }> = {
    sent: { label: "Sent, not opened", tone: "neutral" },
    opened: { label: "Opened", tone: "info" },
    editing: { label: "Customer changed it", tone: "warning" },
    checked_out: { label: "Checked out", tone: "success" },
    revoked: { label: "Off", tone: "neutral" },
    expired: { label: "Expired", tone: "neutral" },
};

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

/**
 * Share the open cart with its customer: one secret link (7 days) they open
 * on their phone, see their prices, change it and check out themselves.
 */
export default function ShareCartPanel({ cartId, share, hasCustomer, customerName }: { cartId: number; share: CartShareInfo | null | undefined; hasCustomer: boolean; customerName?: string | null }) {
    const [copied, setCopied] = React.useState(false);

    if (!share) {
        return (
            <div className="flex items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container-low px-4 py-2">
                <p className="text-[11px] text-on-surface-variant">{hasCustomer ? "Let the customer finish this cart on their phone." : "Choose the customer to share this cart with them."}</p>
                <button
                    type="button"
                    disabled={!hasCustomer}
                    onClick={() => router.post(route("seller.carts.share.store", cartId), {}, { preserveScroll: true })}
                    className="inline-flex shrink-0 items-center gap-1 rounded-[999px] bg-primary px-3 py-1.5 text-[12px] font-bold text-on-primary disabled:opacity-40"
                >
                    <span className="material-symbols-outlined text-[15px]">share</span>
                    Share with customer
                </button>
            </div>
        );
    }

    const text = `Hello${customerName ? ` ${customerName.split(" ")[0]}` : ""}, here is your cart. Check it, change it if you like, and order: ${share.url}`;
    const meta = STAGE[share.stage];
    const copy = () => {
        void navigator.clipboard?.writeText(share.url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="space-y-2 border-b border-outline-variant/60 bg-surface-container-low px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">link</span>
                    <StatusPill label={meta.label} tone={meta.tone} size="sm" />
                    <span className="text-[11px] text-on-surface-variant">
                        {share.last_seen_at ? `seen ${ago(share.last_seen_at)}` : `until ${ago(share.expires_at)}`}
                    </span>
                </span>
                <span className="flex gap-1">
                    <button type="button" onClick={() => router.post(route("seller.carts.share.store", cartId), {}, { preserveScroll: true })} className="rounded-[999px] px-2 py-1 text-[11px] font-bold text-on-surface-variant hover:bg-surface-container">
                        New link
                    </button>
                    <button type="button" onClick={() => router.delete(route("seller.carts.share.destroy", cartId), { preserveScroll: true })} className="rounded-[999px] px-2 py-1 text-[11px] font-bold text-error hover:bg-error-container/50">
                        Turn off
                    </button>
                </span>
            </div>
            <div className="flex gap-1.5">
                <input readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} aria-label="Customer link" className="min-w-0 flex-1 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono text-[11px]" />
                <button type="button" onClick={copy} className="shrink-0 rounded-[10px] bg-primary px-3 text-[12px] font-bold text-on-primary">
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {[
                    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(text)}`],
                    ["Telegram", `https://t.me/share/url?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(text.replace(share.url, "").trim())}`],
                    ["SMS", `sms:?&body=${encodeURIComponent(text)}`],
                ].map(([label, href]) => (
                    <a key={label} href={href} target="_blank" rel="noreferrer" className="rounded-[999px] border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-[11px] font-bold text-primary">
                        {label}
                    </a>
                ))}
            </div>
        </div>
    );
}
