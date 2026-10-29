import React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Deferred, Head, Link, router, usePage, usePoll } from "@inertiajs/react";
import { ChartSkeleton, ListSkeleton, StatTilesSkeleton } from "@/Components/Shared/ui";
import { Box, Button, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { LineChart } from "@mui/x-charts/LineChart";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import History from "@mui/icons-material/History";
import Inventory2 from "@mui/icons-material/Inventory2";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Payments from "@mui/icons-material/Payments";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import Timeline from "@mui/icons-material/Timeline";
import WarningAmber from "@mui/icons-material/WarningAmber";
import type { SvgIconComponent } from "@mui/icons-material";
import { useAdminScope } from "@/Components/Navigation/Admin/useAdminScope";
import { JOURNEY, type JourneyStage } from "@/Components/Visual/OrderJourney";
import Scene from "@/Components/Visual/scenes";
import { motionSafe, pulse } from "@/Components/Visual/motion";
import { AreaTiles, AttentionPanel, GoToBar, NetworkStrip, PanelHead, densePanelSx, type DashboardArea } from "@/Components/Visual/DashboardAreas";
import type { AdminScopeProps } from "@/types/adminScope";
import ShopDaysPanel, { type ShopDayRow } from "@/Components/Admin/Dashboard/ShopDaysPanel";
import TimeFilterChips from "@/Components/Shared/time/TimeFilterChips";
import type { TimeFilterView } from "@/types/time";

/**
 * The admin's first screen, kept dense: greeting and store switch in one
 * band, then what needs attention, the order road as a single row, a tile
 * per area, and the trend, deliveries, low stock and activity panels.
 */

// ========== TYPES ==========

interface LowStockItem {
    item_id: number;
    product_name: string;
    store_id: number | null;
    store_name: string;
    total_stock: number;
    /** The packaging the figure is counted in, e.g. "Carton". */
    unit?: string;
    /** The same figure converted to pieces. */
    pieces?: number;
    /** Server-formatted, e.g. "11 Cartons". */
    display?: string;
}

interface Paginated<T> {
    data: T[];
    current_page?: number;
    last_page?: number;
    total?: number;
    links?: Array<{ url: string | null; label: string; active: boolean }>;
}

interface TrendDay {
    date: string;
    orders: number;
    revenue: number;
}

interface Trend {
    days: TrendDay[];
    peak_day: TrendDay | null;
    avg_order_value: number | null;
}

interface ActiveDelivery {
    id: number;
    tracking_number: string | null;
    status: string;
    courier: string | null;
    store: string | null;
    order: string | null;
}

interface ActivityRow {
    kind: "payment" | "delivery" | "stock";
    title: string;
    detail: string;
    amount: number | null;
    at: string;
}

interface Props {
    lowStockItems?: Paginated<LowStockItem> | LowStockItem[];
    trend?: Trend;
    activeDeliveries?: ActiveDelivery[];
    activity?: ActivityRow[];
    pipeline?: Partial<Record<JourneyStage, number>>;
    areas?: DashboardArea[];
    shopDays?: ShopDayRow[];
    /** The period the cards' counted-over-time facts cover. */
    areaTime?: TimeFilterView;
}

// ========== HELPERS ==========

const money = (amount: number): string =>
    `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

const count = (value: number): string => value.toLocaleString();

const dayLabel = (iso: string): string =>
    new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00`));

const moment = (iso: string): string =>
    new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

type Tone = "default" | "info" | "warning" | "success" | "error";

const DELIVERY_TONE: Record<string, Tone> = {
    pending: "warning",
    dispatched: "info",
    in_transit: "info",
    delivered: "success",
    failed: "error",
};

const ACTIVITY_ICON: Record<ActivityRow["kind"], { icon: SvgIconComponent; tone: Tone }> = {
    payment: { icon: Payments, tone: "success" },
    delivery: { icon: LocalShipping, tone: "info" },
    stock: { icon: Inventory2, tone: "warning" },
};

/** Where each stop of the road opens. */
const STAGE_HREF: Partial<Record<JourneyStage, () => string>> = {
    cart: () => route("admin.carts.index"),
    to_pay: () => route("admin.orders.index", { stage: "to_pay" }),
    paid: () => route("admin.orders.index", { stage: "paid" }),
    packing: () => route("admin.orders.index", { stage: "paid" }),
    to_deliver: () => route("admin.orders.index", { stage: "to_deliver" }),
    delivered: () => route("admin.orders.index", { stage: "delivered" }),
};

const ACTIVITY_PREVIEW = 5;

const tinySx = { fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.3 } as const;

function TonePill({ tone, label }: { tone: Tone; label: string }) {
    const theme = useTheme();
    const color = tone === "default" ? theme.palette.text.secondary : theme.palette[tone].main;

    return (
        <Box component="span" sx={{ px: 0.75, py: 0.25, borderRadius: 1, fontSize: "0.625rem", fontWeight: 700, textTransform: "capitalize", whiteSpace: "nowrap", flexShrink: 0, color, bgcolor: alpha(color, 0.12), border: "1px solid", borderColor: alpha(color, 0.3) }}>
            {label}
        </Box>
    );
}

function ViewAll({ href, label }: { href: string; label: string }) {
    return (
        <Box component={Link} href={href} sx={{ display: "inline-flex", alignItems: "center", fontSize: "0.6875rem", fontWeight: 700, color: "primary.main", textDecoration: "none", whiteSpace: "nowrap", "&:hover": { textDecoration: "underline" } }}>
            {label}
            <ChevronRight sx={{ fontSize: 14 }} />
        </Box>
    );
}

// ========== PIECES ==========

/** Greeting, active store and the store switch in one band. */
function Hero() {
    const theme = useTheme();
    const { props } = usePage<AdminScopeProps & Record<string, unknown>>();
    const { activeStore, accessibleStores, isGlobalAdmin, canSwitch, setStore } = useAdminScope();
    const firstName = props.auth?.user?.first_name ?? "";

    // The chips write the same session-backed store as the sidebar.
    const chips: Array<{ id: number | "all"; name: string }> = [
        ...(isGlobalAdmin ? [{ id: "all" as const, name: "All stores" }] : []),
        ...accessibleStores.map((store) => ({ id: store.id, name: store.name })),
    ];

    return (
        <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, ...motionSafe }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: "success.light", "--pulse-color": alpha(theme.palette.success.light, 0.6), animation: `${pulse} 2s ease-out infinite` }} />
                <Typography noWrap sx={{ fontWeight: 800, fontSize: "0.875rem" }}>
                    {greeting()}{firstName ? `, ${firstName}` : ""}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.6875rem", opacity: 0.75, flexShrink: 0 }}>| {activeStore.name}</Typography>
            </Stack>
            {chips.length > 1 && (
                <Box sx={{ display: "flex", gap: 0.5, overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
                    {chips.map((chip) => {
                        const selected = chip.id === activeStore.id;
                        const clickable = canSwitch && !selected;

                        return (
                            <Box
                                key={String(chip.id)}
                                component="button"
                                type="button"
                                disabled={!clickable}
                                onClick={clickable ? () => setStore(chip.id) : undefined}
                                sx={{
                                    px: 1.25,
                                    py: 0.25,
                                    border: 0,
                                    borderRadius: 999,
                                    whiteSpace: "nowrap",
                                    font: "inherit",
                                    fontSize: "0.6875rem",
                                    fontWeight: selected ? 800 : 600,
                                    cursor: clickable ? "pointer" : "default",
                                    bgcolor: selected ? "background.paper" : alpha(theme.palette.primary.contrastText, 0.18),
                                    color: selected ? "primary.main" : "primary.contrastText",
                                    "&:hover": clickable ? { bgcolor: alpha(theme.palette.primary.contrastText, 0.3) } : undefined,
                                }}
                            >
                                {chip.name}
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Paper>
    );
}

/** The order road as one row of seven stops, each with its count. */
function PipelineStrip({ pipeline }: { pipeline: Partial<Record<JourneyStage, number>> }) {
    const theme = useTheme();

    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead
                icon={<Timeline sx={{ fontSize: 16, color: "primary.main" }} />}
                title="Orders on the road"
                right={<Typography sx={tinySx}>Now · delivered 7d</Typography>}
            />
            {/* Seven stops don't fit a phone; they scroll sideways until md. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(7, minmax(56px, 1fr))", md: "repeat(7, minmax(0, 1fr))" }, overflowX: { xs: "auto", md: "visible" }, gap: 0.25 }}>
                {JOURNEY.map((stage) => {
                    const n = pipeline[stage.key];
                    const busy = (n ?? 0) > 0;
                    const href = STAGE_HREF[stage.key]?.();
                    const cell = (
                        <>
                            <Box sx={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid", borderColor: busy ? "primary.main" : "divider", bgcolor: busy ? alpha(theme.palette.primary.main, 0.08) : "action.hover" }}>
                                <Scene kind={stage.scene} size={20} />
                            </Box>
                            <Typography noWrap sx={{ fontSize: "0.625rem", fontWeight: 700, width: "100%" }}>{stage.label}</Typography>
                            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", px: 0.75, borderRadius: 999, color: busy ? "primary.main" : "text.secondary", bgcolor: busy ? alpha(theme.palette.primary.main, 0.12) : "transparent" }}>
                                {n === undefined ? "–" : count(n)}
                            </Typography>
                        </>
                    );
                    const sx = { display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, textAlign: "center", minWidth: 0, textDecoration: "none", color: "inherit", borderRadius: 1, py: 0.25 } as const;

                    return href ? (
                        <Box key={stage.key} component={Link} href={href} title={stage.hint} sx={{ ...sx, "&:hover": { bgcolor: "action.hover" } }}>{cell}</Box>
                    ) : (
                        <Box key={stage.key} title={stage.hint} sx={sx}>{cell}</Box>
                    );
                })}
            </Box>
        </Paper>
    );
}

function TrendPanel({ trend }: { trend: Trend }) {
    const theme = useTheme();
    const days = trend.days ?? [];
    const hasData = days.some((day) => day.orders > 0 || day.revenue > 0);

    return (
        <Paper elevation={0} sx={densePanelSx}>
            <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-start" }, gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 800, fontSize: "0.8125rem" }}>Orders &amp; revenue</Typography>
                    <Typography noWrap sx={tinySx}>Last 7 days · placed and confirmed</Typography>
                </Box>
                <Stack direction="row" divider={<Box sx={{ borderLeft: "1px solid", borderColor: "divider" }} />} spacing={1} sx={{ flexShrink: 0, textAlign: { xs: "left", sm: "right" } }}>
                    <Box>
                        <Typography sx={{ ...tinySx, fontSize: "0.625rem" }}>Peak day</Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.6875rem" }}>
                            {trend.peak_day ? `${dayLabel(trend.peak_day.date)} · ${trend.peak_day.orders}` : "—"}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography sx={{ ...tinySx, fontSize: "0.625rem" }}>Avg. order</Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: "0.6875rem", color: "primary.main" }}>
                            {trend.avg_order_value !== null ? money(trend.avg_order_value) : "—"}
                        </Typography>
                    </Box>
                </Stack>
            </Box>
            {hasData ? (
                <>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }}>
                        {[
                            { label: "Orders", color: theme.palette.primary.main },
                            { label: "Confirmed payments (ETB)", color: theme.palette.success.main },
                        ].map((key) => (
                            <Stack key={key.label} direction="row" spacing={0.5} alignItems="center">
                                <Box sx={{ width: 10, height: 2, borderRadius: 1, bgcolor: key.color }} />
                                <Typography sx={{ ...tinySx, fontSize: "0.625rem" }}>{key.label}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                    <Box sx={{ width: "100%", height: 140 }}>
                        <LineChart
                            hideLegend
                            xAxis={[{ scaleType: "point", data: days.map((day) => dayLabel(day.date)), tickLabelStyle: { fontSize: 10 } }]}
                            yAxis={[
                                { id: "orders", position: "none", tickMinStep: 1 },
                                { id: "revenue", position: "none" },
                            ]}
                            series={[
                                { data: days.map((day) => day.orders), label: "Orders", yAxisId: "orders", color: theme.palette.primary.main, curve: "monotoneX" },
                                {
                                    data: days.map((day) => day.revenue),
                                    label: "Confirmed payments",
                                    yAxisId: "revenue",
                                    color: theme.palette.success.main,
                                    curve: "monotoneX",
                                    valueFormatter: (value) => (value === null ? "" : money(value)),
                                },
                            ]}
                            margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
                        />
                    </Box>
                </>
            ) : (
                <Typography sx={{ ...tinySx, py: 3, textAlign: "center" }}>No orders or payments in the last 7 days.</Typography>
            )}
        </Paper>
    );
}

function ActiveDeliveriesPanel({ deliveries, total }: { deliveries: ActiveDelivery[]; total: number }) {
    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead
                icon={<LocalShipping sx={{ fontSize: 16, color: "info.main" }} />}
                title="Active deliveries"
                right={<ViewAll href={route("admin.deliveries.index")} label={`View all (${count(total)})`} />}
            />
            {deliveries.length === 0 ? (
                <Typography sx={{ ...tinySx, py: 2, textAlign: "center" }}>No open deliveries.</Typography>
            ) : (
                <Stack spacing={0.5}>
                    {deliveries.map((delivery) => (
                        <Box key={delivery.id} sx={{ display: "flex", alignItems: "center", gap: 1, px: 0.75, py: 0.5, borderRadius: 1, bgcolor: "action.hover", minWidth: 0 }}>
                            <LocalShipping sx={{ fontSize: 15, color: "text.secondary" }} />
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.6875rem", fontFamily: "monospace" }}>
                                    {delivery.tracking_number ?? delivery.order ?? `#${delivery.id}`}
                                </Typography>
                                <Typography noWrap sx={{ ...tinySx, fontSize: "0.625rem" }}>
                                    {[delivery.courier ?? "No courier yet", delivery.store].filter(Boolean).join(" · ")}
                                </Typography>
                            </Box>
                            <TonePill tone={DELIVERY_TONE[delivery.status] ?? "default"} label={delivery.status.replace(/_/g, " ")} />
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}

function LowStockPanel({ lowStock, isGlobalAdmin }: { lowStock: Paginated<LowStockItem> | LowStockItem[]; isGlobalAdmin: boolean }) {
    const items = Array.isArray(lowStock) ? lowStock : lowStock.data ?? [];
    const page = Array.isArray(lowStock) ? null : lowStock;
    const current = page?.current_page ?? 1;
    const last = page?.last_page ?? 1;

    const goToPage = (target: number) => {
        const link = page?.links?.find((candidate) => candidate.label === String(target) && !candidate.active);
        if (link?.url) router.get(link.url, {}, { preserveState: true, preserveScroll: true, only: ["lowStockItems"] });
    };

    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead
                icon={<WarningAmber sx={{ fontSize: 16, color: "warning.main" }} />}
                title={`Low stock by store${page?.total !== undefined ? ` · ${count(page.total)}` : ""}`}
                right={
                    last > 1 ? (
                        <Stack direction="row" alignItems="center" spacing={0.25}>
                            <IconButton size="small" aria-label="Previous page" disabled={current <= 1} onClick={() => goToPage(current - 1)} sx={{ p: 0.25 }}>
                                <ChevronLeft sx={{ fontSize: 16 }} />
                            </IconButton>
                            <Typography sx={{ ...tinySx, whiteSpace: "nowrap" }}>Page {current} of {last}</Typography>
                            <IconButton size="small" aria-label="Next page" disabled={current >= last} onClick={() => goToPage(current + 1)} sx={{ p: 0.25 }}>
                                <ChevronRight sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Stack>
                    ) : undefined
                }
            />
            {items.length === 0 ? (
                <Typography sx={{ ...tinySx, py: 2, textAlign: "center" }}>Nothing is running low.</Typography>
            ) : (
                <Box>
                    {items.map((item, index) => (
                        <Box
                            key={`${item.item_id}-${item.store_name}`}
                            sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "stretch", sm: "center" }, gap: { xs: 0.5, sm: 1 }, py: 0.75, borderTop: index === 0 ? 0 : "1px solid", borderColor: "divider" }}
                        >
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{item.product_name}</Typography>
                                <Typography noWrap sx={{ fontSize: "0.625rem", fontWeight: 600, color: item.total_stock <= 2 ? "error.main" : "warning.dark" }}>
                                    {item.store_name} · {item.display ?? `${item.total_stock} ${item.unit ?? ""}`}
                                    {item.pieces !== undefined && item.unit && item.unit !== "Piece" ? ` (${count(item.pieces)} pcs)` : ""}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                {isGlobalAdmin && item.store_id !== null && (
                                    <Button size="small" variant="contained" disableElevation component={Link} href={route("store.replenish", item.store_id)} sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: "0.625rem", textTransform: "none" }}>
                                        Replenish
                                    </Button>
                                )}
                                <Button size="small" variant="outlined" component={Link} href={route("admin.inventory.transfers.create")} startIcon={<SwapHoriz sx={{ fontSize: "14px !important" }} />} sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: "0.625rem", textTransform: "none", "& .MuiButton-startIcon": { mr: 0.25 } }}>
                                    Transfer
                                </Button>
                            </Stack>
                        </Box>
                    ))}
                </Box>
            )}
        </Paper>
    );
}

function ActivityPanel({ activity }: { activity: ActivityRow[] }) {
    const theme = useTheme();
    const [expanded, setExpanded] = React.useState(false);
    const shown = expanded ? activity : activity.slice(0, ACTIVITY_PREVIEW);

    return (
        <Paper elevation={0} sx={densePanelSx}>
            <PanelHead
                icon={<History sx={{ fontSize: 16, color: "text.secondary" }} />}
                title="Recent activity"
                right={
                    activity.length > ACTIVITY_PREVIEW ? (
                        <Box component="button" type="button" onClick={() => setExpanded((open) => !open)} sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", font: "inherit", fontSize: "0.6875rem", fontWeight: 700, color: "primary.main" }}>
                            {expanded ? "Show less" : `Show all (${activity.length})`}
                        </Box>
                    ) : undefined
                }
            />
            {activity.length === 0 ? (
                <Typography sx={{ ...tinySx, py: 2, textAlign: "center" }}>Nothing has happened yet.</Typography>
            ) : (
                <Stack spacing={0.25}>
                    {shown.map((row, index) => {
                        const { icon: Icon, tone } = ACTIVITY_ICON[row.kind];
                        const color = tone === "default" ? theme.palette.text.secondary : theme.palette[tone].main;

                        return (
                            <Box key={`${row.kind}-${row.at}-${index}`} sx={{ display: "flex", alignItems: "flex-start", gap: 1, p: 0.5, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}>
                                <Box sx={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", color, bgcolor: alpha(color, 0.14) }}>
                                    <Icon sx={{ fontSize: 13 }} />
                                </Box>
                                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                    <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.6875rem", textTransform: "capitalize" }}>{row.title}</Typography>
                                    <Typography noWrap sx={{ ...tinySx, fontSize: "0.625rem" }}>{row.detail}</Typography>
                                    <Typography sx={{ fontSize: "0.5625rem", color: "text.disabled" }}>{moment(row.at)}</Typography>
                                </Box>
                                {row.amount !== null && (
                                    <Typography sx={{ fontWeight: 800, fontSize: "0.6875rem", whiteSpace: "nowrap", color: "success.main", fontVariantNumeric: "tabular-nums" }}>{money(row.amount)}</Typography>
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            )}
        </Paper>
    );
}

// ========== PAGE ==========

export default function Dashboard({
    lowStockItems = [],
    trend = { days: [], peak_day: null, avg_order_value: null },
    activeDeliveries = [],
    activity = [],
    pipeline = {},
    areas = [],
    shopDays = [],
    areaTime,
}: Props) {
    // Live: the figures refresh every 30 seconds without reloading the page.
    const [updatedAt, setUpdatedAt] = React.useState(() => Date.now());
    usePoll(30_000, {
        only: ["areas", "pipeline", "shopDays", "trend", "activeDeliveries", "activity", "lowStockItems", "adminNav"],
        onSuccess: () => setUpdatedAt(Date.now()),
    });

    const { isGlobalAdmin } = useAdminScope();
    const openDeliveries = areas.find((area) => area.key === "delivery")?.value ?? activeDeliveries.length;

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 1600, mx: "auto", width: "100%" }}>
            <Head title="Dashboard" />

            <Hero />

            {/* What is waiting on someone, then a way into every list. */}
            <Deferred
                data={["areas", "pipeline", "shopDays"]}
                fallback={
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <StatTilesSkeleton count={4} />
                        <StatTilesSkeleton count={4} />
                    </Box>
                }
            >
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <AttentionPanel areas={areas} updatedAt={updatedAt} />
                    <GoToBar areas={areas} />

                    <PipelineStrip pipeline={pipeline} />

                    <ShopDaysPanel rows={shopDays} />

                    {areaTime ? (
                        <Box>
                            <TimeFilterChips filter={areaTime} hide={["outside", "all", "archive"]} only={["areas", "areaTime"]} />
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                The big figures are open work right now; "new", "opened", "taken", "delivered" and "confirmed" cover the chosen period.
                            </Typography>
                        </Box>
                    ) : null}
                    <AreaTiles areas={areas} />
                    <NetworkStrip areas={areas} />
                </Box>
            </Deferred>

            <Deferred
                data={["trend", "activeDeliveries", "activity", "lowStockItems"]}
                fallback={
                    <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" } }}>
                        <ChartSkeleton />
                        <ListSkeleton />
                        <ListSkeleton />
                        <ListSkeleton />
                    </Box>
                }
            >
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {/* Trend + deliveries */}
                    <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 2fr) minmax(0, 1fr)" } }}>
                        <TrendPanel trend={trend} />
                        <ActiveDeliveriesPanel deliveries={activeDeliveries.slice(0, 4)} total={openDeliveries} />
                    </Box>

                    {/* Low stock + activity */}
                    <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 3fr) minmax(0, 2fr)" } }}>
                        <LowStockPanel lowStock={lowStockItems} isGlobalAdmin={isGlobalAdmin} />
                        <ActivityPanel activity={activity} />
                    </Box>
                </Box>
            </Deferred>
        </Box>
    );
}

Dashboard.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
