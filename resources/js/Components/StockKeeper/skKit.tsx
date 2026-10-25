import React from "react";
import type { Tone } from "@/Components/Shared/ui";
import type { StockRowStatus } from "@/types/stockkeeper";

/**
 * The stock keeper app's Tailwind building blocks: page header, cards, stat
 * tiles, filter chips, a search box, form fields, a searchable picker, a
 * bottom-sheet / dialog, and paging. Tokens only, so they follow the role
 * colour and light/dark.
 */

export const fmt = (n: number, digits = 0): string => n.toLocaleString(undefined, { maximumFractionDigits: digits });

export const plural = (unit: string, n: number): string => (Math.abs(n) === 1 ? unit : `${unit}s`);

export function when(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const STOCK_STATUS: Record<StockRowStatus, { label: string; tone: Tone }> = {
    healthy: { label: "Healthy", tone: "success" },
    low_stock: { label: "Low stock", tone: "warning" },
    critical: { label: "Critical", tone: "error" },
    out_of_stock: { label: "Out of stock", tone: "error" },
};

export const KIND_LABEL: Record<string, string> = {
    main_hub: "Main Hub",
    remote_hub: "Remote Hub",
    backroom: "Store floor",
    shelf: "Store Shelf",
    store: "Store",
    warehouse: "Warehouse",
};

/** Title, one line under it, and the page's main actions. */
export function SkHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
    return (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-6">
            <div className="min-w-0">
                <h1 className="text-[22px] font-extrabold tracking-tight text-on-surface sm:text-[26px]">{title}</h1>
                {subtitle ? <p className="mt-0.5 max-w-[760px] text-[13px] text-on-surface-variant sm:text-[14px]">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
    );
}

export function SkButton({
    children,
    icon,
    variant = "primary",
    className = "",
    loading = false,
    disabled,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; loading?: boolean; variant?: "primary" | "outline" | "ghost" | "danger" | "success" }) {
    const look = {
        primary: "bg-primary text-on-primary shadow-sm hover:opacity-95",
        success: "bg-success text-on-success shadow-sm hover:opacity-95",
        outline: "border border-outline-variant bg-surface-container-lowest text-primary hover:bg-surface-container-low",
        ghost: "text-on-surface-variant hover:bg-surface-container",
        danger: "text-error hover:bg-error-container/50",
    }[variant];

    return (
        <button
            type="button"
            {...props}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[12px] px-4 py-2.5 text-[14px] font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${look} ${className}`}
        >
            {icon ? <span className="material-symbols-outlined text-[19px]">{icon}</span> : null}
            {children}
        </button>
    );
}

export function SkCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={`rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm ${className}`}>{children}</section>;
}

export function SkCardHeader({ icon, title, right }: { icon?: string; title: React.ReactNode; right?: React.ReactNode }) {
    return (
        <header className="flex items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold text-on-surface">
                {icon ? <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span> : null}
                <span className="truncate">{title}</span>
            </h2>
            {right}
        </header>
    );
}

/** A row of figures: 2 across on phones, `cols` from sm. */
export function SkStats({ items, cols = 4 }: { items: Array<{ label: string; value: React.ReactNode; hint?: string; icon?: string; tone?: "warning" | "error" | "success" }>; cols?: 2 | 3 | 4 | 5 }) {
    const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[cols];
    const toneText = { warning: "text-warning", error: "text-error", success: "text-success" };

    return (
        <div className={`mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:mb-6 ${grid}`}>
            {items.map((s) => (
                <div key={s.label} className="rounded-[18px] border border-outline-variant bg-surface-container-lowest p-3 shadow-sm sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-bold text-on-surface-variant">{s.label}</span>
                        {s.icon ? <span className={`material-symbols-outlined text-[20px] ${s.tone ? toneText[s.tone] : "text-primary"}`}>{s.icon}</span> : null}
                    </div>
                    <p className={`mt-1 text-[22px] font-extrabold tabular-nums sm:text-[26px] ${s.tone ? toneText[s.tone] : "text-on-surface"}`}>{s.value}</p>
                    {s.hint ? <p className="truncate text-[12px] text-on-surface-variant">{s.hint}</p> : null}
                </div>
            ))}
        </div>
    );
}

/** Filter chips: one scrolling row on a phone, wrapping from sm. */
export function SkChips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string; count?: number }>; value: T; onChange: (v: T) => void }) {
    return (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onChange(o.value)}
                        aria-pressed={on}
                        className={`flex shrink-0 items-center gap-1.5 rounded-[999px] border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                            on ? "border-primary bg-primary text-on-primary shadow-sm" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary"
                        }`}
                    >
                        {o.label}
                        {o.count !== undefined ? <span className={`rounded-[999px] px-1.5 text-[11px] ${on ? "bg-on-primary/20" : "bg-surface-container"}`}>{fmt(o.count)}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}

export function SkSearch({ value, onChange, placeholder, right }: { value: string; onChange: (v: string) => void; placeholder: string; right?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-[14px] border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-sm focus-within:border-primary">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full min-w-0 border-0 bg-transparent p-0 text-[15px] text-on-surface placeholder:text-on-surface-variant/70 focus:ring-0" />
            {value ? (
                <button type="button" onClick={() => onChange("")} aria-label="Clear" className="rounded-[8px] p-0.5 text-on-surface-variant hover:bg-surface-container">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
            ) : null}
            {right}
        </div>
    );
}

export function SkField({ label, hint, error, children }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[13px] font-bold text-on-surface">{label}</span>
            {children}
            {error ? <span className="mt-1 block text-[12px] text-error">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-on-surface-variant">{hint}</span> : null}
        </label>
    );
}

export const inputClass = "w-full rounded-[12px] border border-outline-variant bg-surface-container-low px-3 py-2.5 text-[15px] text-on-surface focus:border-primary focus:ring-0";

/** Type to filter a long list (SKUs, places), then pick one. */
export function SkPicker<T>({
    options,
    value,
    onChange,
    getKey,
    getLabel,
    getHint,
    placeholder = "Type to search…",
}: {
    options: T[];
    value: T | null;
    onChange: (v: T | null) => void;
    getKey: (o: T) => string | number;
    getLabel: (o: T) => string;
    getHint?: (o: T) => string | null | undefined;
    placeholder?: string;
}) {
    const [query, setQuery] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const q = query.trim().toLowerCase();
    const shown = (q === "" ? options : options.filter((o) => `${getLabel(o)} ${getHint?.(o) ?? ""}`.toLowerCase().includes(q))).slice(0, 40);

    if (value && !open) {
        return (
            <div className={`${inputClass} flex items-center justify-between gap-2`}>
                <span className="min-w-0">
                    <span className="block truncate font-bold">{getLabel(value)}</span>
                    {getHint?.(value) ? <span className="block truncate font-mono text-[12px] text-on-surface-variant">{getHint(value)}</span> : null}
                </span>
                <button type="button" onClick={() => { onChange(null); setOpen(true); }} className="shrink-0 text-[13px] font-bold text-primary">
                    Change
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} className={inputClass} />
            {open ? (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-[12px] border border-outline-variant bg-surface-container-lowest py-1 shadow-xl">
                    {shown.length === 0 ? (
                        <li className="px-3 py-2 text-[13px] text-on-surface-variant">Nothing matches.</li>
                    ) : (
                        shown.map((o) => (
                            <li key={getKey(o)}>
                                <button type="button" onClick={() => { onChange(o); setOpen(false); setQuery(""); }} className="block w-full px-3 py-2 text-left hover:bg-surface-container-low">
                                    <span className="block truncate text-[14px] font-bold text-on-surface">{getLabel(o)}</span>
                                    {getHint?.(o) ? <span className="block truncate font-mono text-[12px] text-on-surface-variant">{getHint(o)}</span> : null}
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            ) : null}
        </div>
    );
}

/** Bottom sheet on phones, centred dialog from sm. */
export function SkSheet({ open, onClose, title, subtitle, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
    React.useEffect(() => {
        if (!open) return;
        const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[1400] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-surface/40" />
            <div className={`relative flex max-h-[92vh] w-full flex-col rounded-t-[24px] border border-outline-variant bg-surface-container-lowest shadow-2xl sm:rounded-[24px] ${wide ? "sm:max-w-[680px]" : "sm:max-w-[520px]"}`}>
                <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 sm:pt-5">
                    <div className="min-w-0">
                        <div className="mx-auto mb-2 h-1 w-10 rounded-[999px] bg-outline-variant sm:hidden" />
                        <h2 className="text-[18px] font-extrabold text-on-surface">{title}</h2>
                        {subtitle ? <p className="text-[13px] text-on-surface-variant">{subtitle}</p> : null}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded-[10px] p-1.5 text-on-surface-variant hover:bg-surface-container">
                        <span className="material-symbols-outlined text-[22px]">close</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6">{children}</div>
                {footer ? <div className="flex flex-col-reverse gap-2 border-t border-outline-variant/70 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
            </div>
        </div>
    );
}

export function SkPager({ page, last, total, noun = "rows", onPage }: { page: number; last: number; total: number; noun?: string; onPage: (p: number) => void }) {
    if (last <= 1) return null;
    return (
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Pages">
            <SkButton variant="outline" icon="chevron_left" disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3">
                <span className="hidden sm:inline">Previous</span>
            </SkButton>
            <span className="px-2 text-[13px] text-on-surface-variant">
                Page {page} of {last} · {fmt(total)} {noun}
            </span>
            <SkButton variant="outline" disabled={page >= last} onClick={() => onPage(page + 1)} className="px-3">
                <span className="hidden sm:inline">Next</span>
                <span className="material-symbols-outlined text-[19px]">chevron_right</span>
            </SkButton>
        </nav>
    );
}
