import React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, Link, router, usePage, usePoll } from "@inertiajs/react";
import {
    Avatar,
    Box,
    Button,
    Chip,
    Pagination,
    Paper,
    Stack,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import ArrowForward from "@mui/icons-material/ArrowForward";
import Devices from "@mui/icons-material/Devices";
import Inventory2 from "@mui/icons-material/Inventory2";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Payments from "@mui/icons-material/Payments";
import PointOfSale from "@mui/icons-material/PointOfSale";
import Receipt from "@mui/icons-material/Receipt";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import WarningAmber from "@mui/icons-material/WarningAmber";
import Warehouse from "@mui/icons-material/Warehouse";
import type { SvgIconComponent } from "@mui/icons-material";
import { useAdminScope } from "@/Components/Navigation/Admin/useAdminScope";
import OrderJourney, { type JourneyStage } from "@/Components/Visual/OrderJourney";
import { AreaGroups, AttentionStrip, GoToBar, LiveBadge, type DashboardArea } from "@/Components/Visual/DashboardAreas";
import type { AdminScopeProps } from "@/types/adminScope";

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
    sessionsCount?: number;
    rolesBreakdown?: Record<string, number>;
    lowStockItems?: Paginated<LowStockItem> | LowStockItem[];
    trend?: Trend;
    activeDeliveries?: ActiveDelivery[];
    activity?: ActivityRow[];
    pipeline?: Partial<Record<JourneyStage, number>>;
    areas?: DashboardArea[];
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

const DELIVERY_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
    pending: "warning",
    dispatched: "info",
    in_transit: "info",
    delivered: "success",
    failed: "error",
};

const ACTIVITY_ICON: Record<ActivityRow["kind"], { icon: SvgIconComponent; color: "success" | "info" | "warning" }> = {
    payment: { icon: Payments, color: "success" },
    delivery: { icon: LocalShipping, color: "info" },
    stock: { icon: Inventory2, color: "warning" },
};

const panelSx = { p: { xs: 2, sm: 2.5 }, borderRadius: 3, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" } as const;

// ========== PIECES ==========

function TrendPanel({ trend }: { trend: Trend }) {
    const theme = useTheme();
    const days = trend.days ?? [];
    const hasData = days.some((day) => day.orders > 0 || day.revenue > 0);

    return (
        <Paper elevation={0} sx={{ ...panelSx, minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                <Box>
                    <Typography sx={{ fontWeight: 700 }}>Orders &amp; Revenue Overview</Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Last 7 days · orders placed and confirmed payments
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1.5} sx={{ width: { xs: "100%", sm: "auto" }, "& > *": { flex: { xs: 1, sm: "none" } } }}>
                    <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: "action.hover" }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>Peak day</Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                            {trend.peak_day ? `${dayLabel(trend.peak_day.date)} · ${trend.peak_day.orders}` : "—"}
                        </Typography>
                    </Box>
                    <Box sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: "action.hover" }}>
                        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>Avg. order value</Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                            {trend.avg_order_value !== null ? money(trend.avg_order_value) : "—"}
                        </Typography>
                    </Box>
                </Stack>
            </Box>
            {hasData ? (
                <Box sx={{ width: "100%", height: 280, mt: 1 }}>
                    <LineChart
                        xAxis={[{ scaleType: "point", data: days.map((day) => dayLabel(day.date)) }]}
                        yAxis={[
                            { id: "orders", label: "Orders", tickMinStep: 1 },
                            { id: "revenue", label: "ETB", position: "right" },
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
                        margin={{ left: 8, right: 8, top: 16, bottom: 8 }}
                    />
                </Box>
            ) : (
                <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
                    <Typography sx={{ color: "text.secondary", fontSize: "0.875rem" }}>No orders or payments in the last 7 days.</Typography>
                </Box>
            )}
        </Paper>
    );
}

function ActiveDeliveriesPanel({ deliveries }: { deliveries: ActiveDelivery[] }) {
    return (
        <Paper elevation={0} sx={{ ...panelSx, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                <Typography sx={{ fontWeight: 700 }}>Active Deliveries</Typography>
                <Button component={Link} href={route("admin.deliveries.index")} size="small" endIcon={<ArrowForward fontSize="small" />}>
                    Delivery
                </Button>
            </Box>
            {deliveries.length === 0 ? (
                <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", py: 3, textAlign: "center" }}>No open deliveries.</Typography>
            ) : (
                <Stack spacing={1}>
                    {deliveries.map((delivery) => (
                        <Box key={delivery.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.25, borderRadius: 2, bgcolor: "action.hover", minWidth: 0 }}>
                            <LocalShipping fontSize="small" sx={{ color: "text.secondary" }} />
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.875rem" }}>
                                    {delivery.tracking_number ?? delivery.order ?? `#${delivery.id}`}
                                </Typography>
                                <Typography noWrap variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                    {[delivery.courier ?? "No courier yet", delivery.store].filter(Boolean).join(" · ")}
                                </Typography>
                            </Box>
                            <Chip size="small" label={delivery.status.replace(/_/g, " ")} color={DELIVERY_COLOR[delivery.status] ?? "default"} variant="outlined" />
                        </Box>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}

function LowStockPanel({ lowStock, isGlobalAdmin }: { lowStock: Paginated<LowStockItem> | LowStockItem[]; isGlobalAdmin: boolean }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const items = Array.isArray(lowStock) ? lowStock : lowStock.data ?? [];
    const page = Array.isArray(lowStock) ? null : lowStock;

    const goToPage = (target: number) => {
        const link = page?.links?.find((candidate) => candidate.label === String(target) && !candidate.active);
        if (link?.url) router.get(link.url, {}, { preserveState: true, preserveScroll: true });
    };

    return (
        <Paper elevation={0} sx={{ ...panelSx, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <WarningAmber sx={{ color: "warning.main" }} />
                <Typography sx={{ fontWeight: 700 }}>Low stock by store</Typography>
                {page?.total !== undefined && <Chip size="small" label={page.total} />}
            </Box>
            {items.length === 0 ? (
                <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", py: 3, textAlign: "center" }}>Nothing is running low.</Typography>
            ) : (
                <Stack spacing={1}>
                    {items.map((item) => (
                        <Box
                            key={`${item.item_id}-${item.store_name}`}
                            sx={{ display: "flex", alignItems: { xs: "flex-start", sm: "center" }, gap: 1.5, p: 1.25, borderRadius: 2, border: "1px solid", borderColor: "divider", flexDirection: { xs: "column", sm: "row" } }}
                        >
                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{item.product_name}</Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    {item.store_name} · {item.display ?? `${item.total_stock} ${item.unit ?? ""}`}
                                    {item.pieces !== undefined && item.unit && item.unit !== "Piece" ? ` (${count(item.pieces)} pcs)` : ""}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1}>
                                {isGlobalAdmin && item.store_id !== null && (
                                    <Button size="small" variant="outlined" component={Link} href={route("store.replenish", item.store_id)}>
                                        Replenish
                                    </Button>
                                )}
                                <Button size="small" variant="outlined" startIcon={<SwapHoriz fontSize="small" />} component={Link} href={route("admin.inventory.transfers.create")}>
                                    Transfer
                                </Button>
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
            {page?.last_page !== undefined && page.last_page > 1 && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                    <Pagination count={page.last_page} page={page.current_page ?? 1} onChange={(_, target) => goToPage(target)} size={isMobile ? "small" : "medium"} color="primary" />
                </Box>
            )}
        </Paper>
    );
}

function ActivityPanel({ activity }: { activity: ActivityRow[] }) {
    return (
        <Paper elevation={0} sx={{ ...panelSx, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, mb: 1.5 }}>Recent Activity</Typography>
            {activity.length === 0 ? (
                <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", py: 3, textAlign: "center" }}>Nothing has happened yet.</Typography>
            ) : (
                <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {activity.map((row, index) => {
                        const { icon: Icon, color } = ACTIVITY_ICON[row.kind];

                        return (
                            <Box component="li" key={`${row.kind}-${row.at}-${index}`} sx={{ display: "flex", gap: 1.5, position: "relative", pb: index === activity.length - 1 ? 0 : 2 }}>
                                {index < activity.length - 1 && (
                                    <Box sx={{ position: "absolute", left: 15, top: 34, bottom: 0, width: "2px", bgcolor: "divider" }} />
                                )}
                                <Avatar sx={{ width: 32, height: 32, bgcolor: `${color}.main`, color: `${color}.contrastText` }}>
                                    <Icon sx={{ fontSize: 18 }} />
                                </Avatar>
                                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                                        <Typography sx={{ fontWeight: 600, fontSize: "0.875rem", textTransform: "capitalize" }}>{row.title}</Typography>
                                        {row.amount !== null && (
                                            <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", whiteSpace: "nowrap" }}>{money(row.amount)}</Typography>
                                        )}
                                    </Box>
                                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", wordBreak: "break-word" }}>
                                        {row.detail}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: "text.disabled" }}>{moment(row.at)}</Typography>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Paper>
    );
}

// ========== PAGE ==========


export default function Dashboard({
    sessionsCount = 0,
    rolesBreakdown = {},
    lowStockItems = [],
    trend = { days: [], peak_day: null, avg_order_value: null },
    activeDeliveries = [],
    activity = [],
    pipeline = {},
    areas = [],
}: Props) {
    // Live: the figures refresh every 30 seconds without reloading the page.
    const [updatedAt, setUpdatedAt] = React.useState(() => Date.now());
    usePoll(30_000, {
        only: ["areas", "pipeline", "trend", "activeDeliveries", "activity", "lowStockItems", "sessionsCount", "rolesBreakdown", "adminNav"],
        onSuccess: () => setUpdatedAt(Date.now()),
    });

    const { props } = usePage<AdminScopeProps & Record<string, unknown>>();
    const { activeStore, accessibleStores, isGlobalAdmin, canSwitch, setStore } = useAdminScope();
    const firstName = props.auth?.user?.first_name ?? "";

    // The hero's chips write the same session-backed store as the sidebar.
    const chips: Array<{ id: number | "all"; name: string }> = [
        ...(isGlobalAdmin ? [{ id: "all" as const, name: "All stores" }] : []),
        ...accessibleStores.map((store) => ({ id: store.id, name: store.name })),
    ];

    const signedInRoles = Object.entries(rolesBreakdown)
        .filter(([, n]) => n > 0)
        .slice(0, 3)
        .map(([role, n]): [string, string] => [role.replace(/_/g, " "), count(n)]);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, sm: 3 }, maxWidth: 1600, mx: "auto", width: "100%" }}>
            <Head title="Dashboard" />

            {/* Hero */}
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 2.5, sm: 3.5 },
                    borderRadius: 4,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                }}
            >
                <Box>
                    <Typography sx={{ fontSize: { xs: "1.375rem", sm: "1.75rem" }, fontWeight: 800 }}>
                        {greeting()}{firstName ? `, ${firstName}` : ""}
                    </Typography>
                    <Typography sx={{ opacity: 0.85, fontSize: "0.9375rem" }}>
                        {activeStore.id === "all" ? "Every store at a glance." : `Here is what is happening at ${activeStore.name}.`}
                    </Typography>
                </Box>
                {chips.length > 0 && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {chips.map((chip) => {
                            const selected = chip.id === activeStore.id;

                            return (
                                <Chip
                                    key={String(chip.id)}
                                    label={chip.name}
                                    clickable={canSwitch && !selected}
                                    onClick={canSwitch && !selected ? () => setStore(chip.id) : undefined}
                                    sx={{
                                        fontWeight: 700,
                                        bgcolor: selected ? "background.paper" : "transparent",
                                        color: selected ? "primary.main" : "primary.contrastText",
                                        border: "1px solid",
                                        borderColor: selected ? "background.paper" : "primary.contrastText",
                                    }}
                                />
                            );
                        })}
                    </Box>
                )}
            </Paper>

            {/* Jump anywhere, then what is waiting on someone. */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>Needs attention</Typography>
                    <LiveBadge updatedAt={updatedAt} />
                </Box>
                <AttentionStrip areas={areas} />
                <GoToBar areas={areas} />
            </Box>

            {/* The road, live: how many orders sit at each stop. */}
            <Paper elevation={0} sx={{ ...panelSx, minWidth: 0 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
                    <Box>
                        <Typography sx={{ fontWeight: 700 }}>Orders on the road</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            Open carts and orders at each stage now · delivered in the last 7 days
                        </Typography>
                    </Box>
                    <Button component={Link} href={route("admin.guide")} size="small" endIcon={<ArrowForward fontSize="small" />}>
                        How it works
                    </Button>
                </Box>
                <OrderJourney
                    counts={{ ...pipeline }}
                    compact={false}
                    hrefs={{
                        cart: route("admin.carts.index"),
                        to_pay: route("admin.orders.index", { stage: "to_pay" }),
                        paid: route("admin.orders.index", { stage: "paid" }),
                        packing: route("admin.orders.index", { stage: "paid" }),
                        to_deliver: route("admin.orders.index", { stage: "to_deliver" }),
                        delivered: route("admin.orders.index", { stage: "delivered" }),
                    }}
                />
            </Paper>

            {/* Every area of the app, grouped; each card opens its list. */}
            <AreaGroups areas={areas} />

            {/* Trend + deliveries */}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 2fr) minmax(0, 1fr)" } }}>
                <TrendPanel trend={trend} />
                <ActiveDeliveriesPanel deliveries={activeDeliveries} />
            </Box>

            {/* Low stock + activity */}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" } }}>
                <LowStockPanel lowStock={lowStockItems} isGlobalAdmin={isGlobalAdmin} />
                <ActivityPanel activity={activity} />
            </Box>
        </Box>
    );
}

Dashboard.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
