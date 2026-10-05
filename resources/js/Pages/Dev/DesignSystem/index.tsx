import { Head } from "@inertiajs/react";
import { Radio, RadioGroup } from "@headlessui/react";
import React, { useState } from "react";

import DevLayout from "@/Layouts/DevLayout";
import {
    ActionTile,
    Card,
    EmptyState,
    HeaderIconButton,
    PageHeader,
    SectionTitle,
    StatCard,
    STATUS_TONES,
    StatusPill,
    TONE_NAMES,
    headerIconButtonClass,
    type Tone,
} from "@/Components/Shared/ui";
import { ROLES, useRole, type RoleKey } from "@/theme";

/**
 * Every shared UI component (Components/Shared/ui) in all its states, for
 * checking by eye in each role x light/dark without changing subdomains.
 *
 * Each preview panel carries its own `data-role` + `data-mode`, which
 * resources/css/tokens.css honours on any element, so the panel renders in
 * that role's colors and mode regardless of the page around it.
 */

type ModeChoice = "both" | "light" | "dark";
type RoleChoice = RoleKey | "all";
type Mode = "light" | "dark";

const MODE_CHOICES: { value: ModeChoice; label: string }[] = [
    { value: "both", label: "Light + dark" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

/** Links in the previews point back at this page. */
function selfHref(): string | null {
    try {
        return route("dev.design-system.index");
    } catch {
        return null;
    }
}

const TONE_ICONS: Record<Tone, string> = {
    primary: "local_shipping",
    tertiary: "auto_awesome",
    info: "verified",
    success: "task_alt",
    warning: "payments",
    error: "warning",
    neutral: "cancel",
};

function Segmented<T extends string>({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}): React.ReactElement {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-label-caps uppercase text-on-surface-variant">{label}</span>
            <RadioGroup value={value} onChange={onChange} aria-label={label} className="flex flex-wrap gap-1.5">
                {options.map((option) => (
                    <Radio
                        key={option.value}
                        value={option.value}
                        className="cursor-pointer rounded-[999px] border border-outline-variant bg-surface-container-lowest px-3 py-1 text-[12px] font-semibold text-on-surface transition-colors hover:bg-surface-container-low focus:outline-none data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-on-primary data-[focus]:ring-2 data-[focus]:ring-primary/40"
                    >
                        {option.label}
                    </Radio>
                ))}
            </RadioGroup>
        </div>
    );
}

/** A subtree scoped to one role x mode. */
function Preview({
    role,
    mode,
    children,
}: {
    role: RoleKey;
    mode: Mode;
    children: React.ReactNode;
}): React.ReactElement {
    const label = ROLES.find((r) => r.key === role)?.label ?? role;

    return (
        <div
            data-role={role}
            data-mode={mode}
            className="min-w-0 rounded-[16px] border border-outline-variant bg-background p-3 text-on-surface"
        >
            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-on-surface-variant">
                    data-role="{role}" data-mode="{mode}"
                </span>
                <span className="rounded-[999px] bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary">
                    {label} · {mode}
                </span>
            </div>
            {children}
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
    return <p className="mb-1.5 mt-4 font-mono text-[10px] uppercase tracking-wider text-outline first:mt-0">{children}</p>;
}

/** The full gallery: every component, every state. */
function Gallery({ href }: { href: string | null }): React.ReactElement {
    const [notifyOpen, setNotifyOpen] = useState(false);

    return (
        <div>
            <Label>PageHeader</Label>
            <PageHeader
                className="px-1 pb-3"
                icon="warehouse"
                title="Abebe Kebede"
                subtitle="Bole Store · Addis Ababa"
                actions={
                    <>
                        <a href={href ?? undefined} aria-label="Settings" className={headerIconButtonClass}>
                            <span className="material-symbols-outlined text-[20px]">settings</span>
                        </a>
                        <HeaderIconButton
                            icon="notifications"
                            aria-label="Notifications"
                            active={notifyOpen}
                            onClick={() => setNotifyOpen((open) => !open)}
                        />
                    </>
                }
            />
            <PageHeader className="px-1 pb-3" icon="storefront">
                <span className="rounded-[999px] bg-primary px-5 py-2 text-[14px] font-bold text-on-primary">
                    Sign in or Register
                </span>
            </PageHeader>

            <Label>SectionTitle</Label>
            <div className="rounded-[16px] border border-outline-variant bg-surface-container-lowest p-3.5">
                <SectionTitle
                    title="Shipments"
                    badge={<StatusPill label="Preview" tone="neutral" size="sm" />}
                    action={{ label: "Console", href }}
                />
                <SectionTitle title="Merchant Operations" variant="caps" note="Core Tools" />
                <SectionTitle title="No action (href null)" action={{ label: "Hidden", href: null }} className="" />
            </div>

            <Label>Card + StatCard (every tone, with counts)</Label>
            <Card title="My Orders" action={{ label: "Pipeline map", href }}>
                <div className="grid grid-cols-4 gap-1 gap-y-3 text-center">
                    {TONE_NAMES.map((tone, i) => (
                        <StatCard
                            key={tone}
                            label={tone}
                            caption="Caption text"
                            icon={TONE_ICONS[tone]}
                            tone={tone}
                            count={[3, 12, 0, 150, 7, 1, 42][i]}
                            href={href}
                        />
                    ))}
                </div>
            </Card>

            <Label>StatCard states</Label>
            <Card>
                <div className="grid grid-cols-5 gap-1 text-center">
                    <StatCard label="Linked" caption="Hover me" icon="inventory_2" tone="info" count={4} href={href} />
                    <StatCard label="Static" caption="No href" icon="inventory_2" tone="info" count={4} />
                    <StatCard label="Overdue" caption="Alert" icon="warning" tone="error" count={2} alert href={href} />
                    <StatCard label="Stock" caption="Badge text" icon="shelves" tone="success" count={1180} badge="1.2k" href={href} />
                    <StatCard label="Returns" caption="Disabled · soon" icon="assignment_return" tone="error" count={9} disabled />
                </div>
            </Card>

            <Label>ActionTile · row (every tone, count, surface, soon)</Label>
            <Card title="Operations" titleVariant="caps" note="Core Tools">
                <div className="grid grid-cols-1 gap-2.5">
                    {TONE_NAMES.map((tone) => (
                        <ActionTile
                            key={tone}
                            label={`Tone ${tone}`}
                            caption="Linked row"
                            icon={TONE_ICONS[tone]}
                            tone={tone}
                            href={href}
                            count={tone === "info" ? 12 : undefined}
                        />
                    ))}
                    <ActionTile
                        label="Balance"
                        caption="Gradient surface"
                        icon="account_balance_wallet"
                        tone="success"
                        href={href}
                        surface="border-success/30 bg-gradient-to-br from-success-container/60 to-surface-container-lowest"
                    />
                    <ActionTile label="Documents" caption="Not built yet" icon="description" tone="primary" href={null} />
                </div>
            </Card>

            <Label>ActionTile · chip</Label>
            <Card>
                <div className="grid grid-cols-2 gap-2">
                    <ActionTile variant="chip" label="Store Orders" icon="receipt_long" href={href} />
                    <ActionTile variant="chip" label="Bulk waybills" icon="library_add_check" href={null} />
                </div>
            </Card>

            <Label>StatusPill · tones</Label>
            <div className="flex flex-wrap gap-1.5">
                {TONE_NAMES.map((tone) => (
                    <StatusPill key={tone} label={tone} tone={tone} />
                ))}
                <StatusPill label="Soon" muted />
                <StatusPill label="Preview" tone="neutral" size="sm" />
                <StatusPill label="xs" tone="info" size="xs" />
                <StatusPill status="in_transit" icon="local_shipping" />
            </div>

            <Label>StatusPill · shared status map</Label>
            <div className="flex flex-wrap gap-1.5">
                {Object.keys(STATUS_TONES).map((status) => (
                    <StatusPill key={status} status={status} />
                ))}
                <StatusPill status="something_unknown" />
            </div>

            <Label>EmptyState</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] border border-outline-variant bg-surface-container-lowest p-4 shadow-lg">
                    <EmptyState
                        icon="notifications_off"
                        title="You're all caught up"
                        description="Alerts will appear here once the feed is live."
                    />
                </div>
                <EmptyState
                    framed
                    icon="inventory"
                    title="No shipments yet"
                    description="Build one from the replenish board."
                    action={<StatusPill label="Action slot" tone="primary" />}
                />
            </div>
        </div>
    );
}

/** One row per role: the components at a glance, for comparing hues. */
function Glance({ href }: { href: string | null }): React.ReactElement {
    return (
        <div>
            <PageHeader className="px-1 pb-3" icon="warehouse" title="Header title" subtitle="Subtitle" />
            <Card title="Pipeline" action={{ label: "Open", href }}>
                <div className="grid grid-cols-5 gap-1 text-center">
                    {(["warning", "info", "primary", "success", "error"] as Tone[]).map((tone, i) => (
                        <StatCard
                            key={tone}
                            label={tone}
                            caption="Caption"
                            icon={TONE_ICONS[tone]}
                            tone={tone}
                            count={i + 1}
                            alert={tone === "error"}
                            href={href}
                        />
                    ))}
                </div>
            </Card>
            <div className="grid grid-cols-1 gap-2">
                <ActionTile label="Customers" caption="Accounts & directory" icon="group" tone="primary" href={href} count={8} />
                <ActionTile label="Calendar" caption="Not built yet" icon="calendar_today" tone="warning" href={null} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {["pending", "scheduled", "in_transit", "delivered", "cancelled", "draft"].map((status) => (
                    <StatusPill key={status} status={status} />
                ))}
            </div>
        </div>
    );
}

export default function DesignSystem(): React.ReactElement {
    const current = useRole();
    const [role, setRole] = useState<RoleChoice>(current);
    const [mode, setMode] = useState<ModeChoice>("both");
    const href = selfHref();

    const modes: Mode[] = mode === "both" ? ["light", "dark"] : [mode];
    const roleOptions: { value: RoleChoice; label: string }[] = [
        ...ROLES.map((r) => ({ value: r.key as RoleChoice, label: r.label })),
        { value: "all", label: "All roles" },
    ];

    return (
        <>
            <Head title="Design System" />

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-[16px] border border-outline-variant bg-surface-container-lowest p-4 text-on-surface">
                    <p className="text-body-sm text-on-surface-variant">
                        Components from <code className="font-mono">resources/js/Components/Shared/ui</code>. Each
                        panel sets its own <code className="font-mono">data-role</code> /{" "}
                        <code className="font-mono">data-mode</code>, so it shows that role&apos;s colors in that
                        mode without leaving this subdomain. Links point back at this page.
                    </p>
                    <Segmented label="Role" value={role} onChange={setRole} options={roleOptions} />
                    <Segmented label="Mode" value={mode} onChange={setMode} options={MODE_CHOICES} />
                </div>

                {role === "all" ? (
                    ROLES.map((r) => (
                        <div key={r.key} className={`grid grid-cols-1 gap-4 ${modes.length > 1 ? "lg:grid-cols-2" : ""}`}>
                            {modes.map((m) => (
                                <Preview key={m} role={r.key} mode={m}>
                                    <Glance href={href} />
                                </Preview>
                            ))}
                        </div>
                    ))
                ) : (
                    <div className={`grid grid-cols-1 gap-4 ${modes.length > 1 ? "lg:grid-cols-2" : ""}`}>
                        {modes.map((m) => (
                            <Preview key={m} role={role} mode={m}>
                                <Gallery href={href} />
                            </Preview>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

DesignSystem.layout = (page: React.ReactNode) => <DevLayout>{page}</DevLayout>;
