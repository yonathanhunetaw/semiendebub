import * as React from "react";
import { Alert, Box, Card, Chip, Collapse, IconButton, MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import ExpandMore from "@mui/icons-material/ExpandMore";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";

import type { DataReplacedData, EventLevel, NodeStatus, SystemEvent, SystemNode, SystemStatusSnapshot } from "@/types/systemStatus";
import { EVENT_LABELS, ago, bytes, localTime } from "@/Components/Admin/System/systemFormat";

export const cardSx = { borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "none", p: 2 } as const;

const levelColor: Record<EventLevel, "info" | "warning" | "error"> = { info: "info", warn: "warning", error: "error" };

function LevelIcon({ level }: { level: EventLevel }) {
    if (level === "error") return <ErrorOutlineRounded color="error" fontSize="small" />;
    if (level === "warn") return <WarningAmberRounded color="warning" fontSize="small" />;

    return <InfoOutlined color="info" fontSize="small" />;
}

const statusLabel: Record<NodeStatus, string> = { online: "Online", stale: "Not seen lately", offline: "Offline", off: "Off (on demand)" };
const statusColor: Record<NodeStatus, "success" | "warning" | "error" | "default"> = { online: "success", stale: "warning", offline: "error", off: "default" };

/** Who is serving, how fresh the lease is, and the newest backup and deploy. */
export function LiveBanner({ status }: { status: SystemStatusSnapshot }) {
    const { lease, live_node: live, latest_backup: backup, deployed } = status;

    return (
        <Card sx={{ ...cardSx, borderColor: live ? "success.main" : "error.main" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ alignItems: { md: "center" } }}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="overline" color="text.secondary">
                        Live now
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        {live ? <CheckCircleRounded color="success" /> : <ErrorOutlineRounded color="error" />}
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>
                            {live ?? "Nobody holds the lease"}
                        </Typography>
                        {lease?.pinned && live && <Chip size="small" color="info" label="taken over on purpose" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {lease && lease.node
                            ? `Lease refreshed ${ago(lease.age)}; it expires after ${Math.round(lease.ttl / 60)} min without a refresh.`
                            : "No lease is recorded. The next backup job to run will take it."}
                    </Typography>
                </Box>
                <Stack spacing={0.5} sx={{ minWidth: { md: 320 } }}>
                    <Typography variant="body2">
                        <b>Newest backup:</b>{" "}
                        {backup ? `${bytes(backup.bytes)} by ${backup.node}, ${ago(backup.age)}` : "none found"}
                    </Typography>
                    <Typography variant="body2">
                        <b>Deployed commit:</b> {deployed ? `${deployed.commit.slice(0, 10)} (by ${deployed.node})` : "none published yet"}
                    </Typography>
                </Stack>
            </Stack>
        </Card>
    );
}

export function AlertList({ alerts }: { alerts: SystemStatusSnapshot["alerts"] }) {
    if (alerts.length === 0) {
        return (
            <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>
                Nothing needs attention.
            </Alert>
        );
    }

    return (
        <Stack spacing={1}>
            {alerts.map((a, i) => (
                <Alert key={i} severity={a.level === "error" ? "error" : "warning"} variant="outlined" sx={{ borderRadius: 3 }}>
                    {a.message}
                </Alert>
            ))}
        </Stack>
    );
}

export function NodeCards({ nodes, youAre }: { nodes: SystemNode[]; youAre: string }) {
    if (nodes.length === 0) {
        return <Typography color="text.secondary">No node has reported yet. Heartbeats appear once the sync job runs on each server.</Typography>;
    }

    return (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" } }}>
            {nodes.map((n) => (
                <Card key={n.name} sx={{ ...cardSx, borderColor: n.is_live ? "success.main" : "divider" }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>{n.name}</Typography>
                        {n.is_live && <Chip size="small" color="success" label="LIVE" />}
                        {n.name === youAre && <Chip size="small" variant="outlined" label="you are here" />}
                        <Chip size="small" color={statusColor[n.status]} variant={n.status === "off" ? "outlined" : "filled"} label={statusLabel[n.status]} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {n.role || "no role"}
                        {n.on_demand ? " · on demand" : ""} · seen {ago(n.last_seen_age)}
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: "wrap" }}>
                        <Typography variant="body2">
                            Code: <b>{n.commit || "?"}</b>
                        </Typography>
                        <Typography variant="body2" color={n.in_sync ? "success.main" : "warning.main"}>
                            {n.in_sync ? "Data matches the newest backup" : "Data differs from the newest backup"}
                        </Typography>
                    </Stack>
                </Card>
            ))}
        </Box>
    );
}

const verdictLabel: Record<NonNullable<DataReplacedData["verdict"]>, { text: string; color: "success" | "warning" | "error" }> = {
    identical_rowcounts: { text: "Same row counts", color: "success" },
    rows_added_only: { text: "Only gained rows", color: "warning" },
    rows_missing: { text: "Rows missing", color: "error" },
};

/** Each time a node's data was replaced by a backup: what was on it, what was lost. */
export function DataLossPanel({ events }: { events: SystemEvent[] }) {
    if (events.length === 0) {
        return <Typography color="text.secondary">No hand-over has replaced a node's data in the last 30 days.</Typography>;
    }

    return (
        <Stack spacing={1.5}>
            {events.map((e, i) => {
                const d = e.data as DataReplacedData;
                const verdict = verdictLabel[d.verdict ?? "identical_rowcounts"];
                const changed = Object.entries(d.changed ?? {});

                return (
                    <Card key={`${e.ts}-${i}`} sx={{ ...cardSx, borderColor: d.verdict === "rows_missing" ? "error.main" : "divider" }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                            <Chip size="small" color={verdict.color} label={verdict.text} />
                            <Typography sx={{ fontWeight: 700 }}>
                                {e.node} took {d.from ?? "another node"}'s data
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {localTime(e.time)} ({ago(e.age)})
                            </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            {d.rows_missing ?? 0} rows existed on {e.node} but not in the backup · {d.rows_added ?? 0} rows are new
                        </Typography>
                        {changed.length > 0 && (
                            <Box sx={{ mt: 1, fontFamily: "monospace", fontSize: "0.85rem" }}>
                                {changed.map(([table, [before, after]]) => (
                                    <div key={table}>
                                        {table}: {before} → {after}
                                    </div>
                                ))}
                            </Box>
                        )}
                        {d.safety_dump && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                                The replaced data is kept on {e.node} in <code>~/.duka-backup/{d.safety_dump}</code>.
                            </Typography>
                        )}
                    </Card>
                );
            })}
            <Typography variant="caption" color="text.secondary">
                Row counts show added or missing rows. They cannot see a value that was edited without adding or removing a row.
            </Typography>
        </Stack>
    );
}

function EventRow({ event }: { event: SystemEvent }) {
    const [open, setOpen] = React.useState(false);
    const hasData = Object.keys(event.data).length > 0;

    return (
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider", py: 1 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <LevelIcon level={event.level} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                        {event.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {localTime(event.time)} · {ago(event.age)} · {EVENT_LABELS[event.type] ?? event.type}
                    </Typography>
                </Box>
                <Chip size="small" variant="outlined" label={event.node} color={levelColor[event.level]} />
                {hasData && (
                    <IconButton size="small" onClick={() => setOpen((o) => !o)} aria-label="Details" sx={{ transform: open ? "rotate(180deg)" : "none" }}>
                        <ExpandMore fontSize="small" />
                    </IconButton>
                )}
            </Stack>
            <Collapse in={open}>
                <Box component="pre" sx={{ m: 1, p: 1.5, borderRadius: 2, bgcolor: "action.hover", fontSize: "0.78rem", overflowX: "auto" }}>
                    {JSON.stringify(event.data, null, 2)}
                </Box>
            </Collapse>
        </Box>
    );
}

/** The recent events of every node, newest first, with a level and node filter. */
export function Timeline({ events, nodes }: { events: SystemEvent[]; nodes: string[] }) {
    const [level, setLevel] = React.useState<"all" | "attention">("all");
    const [node, setNode] = React.useState<string>("all");

    const shown = events.filter((e) => (level === "all" || e.level !== "info") && (node === "all" || e.node === node));

    return (
        <Box>
            <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: "center", flexWrap: "wrap" }}>
                <ToggleButtonGroup size="small" exclusive value={level} onChange={(_, v) => v && setLevel(v)}>
                    <ToggleButton value="all">Everything</ToggleButton>
                    <ToggleButton value="attention">Warnings &amp; errors</ToggleButton>
                </ToggleButtonGroup>
                <Select size="small" value={node} onChange={(e) => setNode(e.target.value)} sx={{ minWidth: 140 }}>
                    <MenuItem value="all">All nodes</MenuItem>
                    {nodes.map((n) => (
                        <MenuItem key={n} value={n}>
                            {n}
                        </MenuItem>
                    ))}
                </Select>
            </Stack>
            {shown.length === 0 ? (
                <Typography color="text.secondary">Nothing to show for this filter.</Typography>
            ) : (
                shown.map((e, i) => <EventRow key={`${e.ts}-${e.node}-${e.type}-${i}`} event={e} />)
            )}
        </Box>
    );
}
