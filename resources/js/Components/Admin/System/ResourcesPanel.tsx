import * as React from "react";
import { Alert, Box, Card, Chip, Collapse, LinearProgress, Stack, Typography } from "@mui/material";

import type { ContainerInfo, HostInfo, NodeResources } from "@/types/systemStatus";
import { cardSx } from "@/Components/Admin/System/SystemParts";
import { ago, bytes, duration } from "@/Components/Admin/System/systemFormat";

/** Green below 70, amber from 70, red from 85: the same numbers the server alerts on (disk 85/95, memory under 10% free). */
function level(pct: number): "success" | "warning" | "error" {
    return pct >= 85 ? "error" : pct >= 70 ? "warning" : "success";
}

function Meter({ label, pct, detail }: { label: string; pct: number | null; detail: string }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                    {label}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {pct === null ? "unknown" : `${pct}%`} · {detail}
                </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, pct ?? 0))} color={pct === null ? "inherit" : level(pct)} sx={{ height: 8, borderRadius: 4 }} aria-label={label} />
        </Box>
    );
}

function HostMeters({ host }: { host: HostInfo }) {
    return (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
            <Meter label="CPU load" pct={host.load_pct} detail={`${host.load[0]} of ${host.cpus} core${host.cpus === 1 ? "" : "s"}`} />
            <Meter label="Memory" pct={host.mem_pct} detail={`${bytes(host.mem_used)} of ${bytes(host.mem_total)}`} />
            {host.disks.map((d) => (
                <Meter key={d.mount} label={`Disk ${d.mount}`} pct={d.pct} detail={`${bytes(d.used)} of ${bytes(d.total)}`} />
            ))}
        </Box>
    );
}

const stateColor = (c: ContainerInfo): "success" | "warning" | "error" | "default" =>
    c.state === "running" ? (c.health === "unhealthy" ? "error" : c.health === "starting" ? "warning" : "success") : c.state === "restarting" || c.state === "dead" ? "error" : "default";

function ContainerRow({ c }: { c: ContainerInfo }) {
    const label = c.state === "running" && c.health !== "" ? `running · ${c.health}` : c.state;

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap", rowGap: 0.5 }}>
            <Box sx={{ flex: "1 1 180px", minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                    {c.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    {c.image}
                </Typography>
            </Box>
            <Chip size="small" color={stateColor(c)} variant={c.state === "running" ? "filled" : "outlined"} label={label} />
            <Typography variant="caption" sx={{ flex: "0 1 260px" }} color="text.secondary">
                {c.uptime !== null ? `up ${duration(c.uptime)}` : c.status}
                {c.restarts > 0 ? ` · ${c.restarts} restart${c.restarts === 1 ? "" : "s"}` : ""}
                {c.cpu !== null ? ` · CPU ${c.cpu}%` : ""}
                {c.mem !== null ? ` · ${bytes(c.mem)}` : ""}
            </Typography>
        </Stack>
    );
}

function NodeBlock({ node }: { node: NodeResources }) {
    const [showStopped, setShowStopped] = React.useState(false);

    if (!node.reported) {
        return (
            <Card sx={cardSx}>
                <Typography sx={{ fontWeight: 800 }}>{node.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                    No resource snapshot yet. It appears within about 5 minutes after this server runs the updated scripts (git pull).
                </Typography>
            </Card>
        );
    }

    const running = node.containers.filter((c) => c.state === "running");
    const rest = node.containers.filter((c) => c.state !== "running");
    const trouble = rest.filter((c) => c.state === "restarting" || c.state === "dead");
    const stopped = rest.filter((c) => !trouble.includes(c));

    return (
        <Card sx={cardSx}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>{node.name}</Typography>
                <Chip size="small" variant="outlined" label={`up ${duration(node.host.uptime)}`} />
                {node.host.temp_c !== null && <Chip size="small" color={node.host.temp_c >= 85 ? "error" : node.host.temp_c >= 80 ? "warning" : "default"} variant="outlined" label={`${node.host.temp_c}°C`} />}
                <Chip size="small" color={node.stale ? "warning" : "default"} variant="outlined" label={node.stale ? `stale: last report ${ago(node.age)}` : `as of ${ago(node.age)}`} />
            </Stack>

            <HostMeters host={node.host} />

            <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Containers
                </Typography>
                {!node.docker_ok ? (
                    <Typography variant="body2" color="text.secondary">
                        Docker did not answer on this server when it reported.
                    </Typography>
                ) : (
                    <>
                        {[...running, ...trouble].map((c) => (
                            <ContainerRow key={c.name} c={c} />
                        ))}
                        {running.length + trouble.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                No container is running.
                            </Typography>
                        )}
                        {stopped.length > 0 && (
                            <>
                                <Typography
                                    component="button"
                                    type="button"
                                    variant="caption"
                                    onClick={() => setShowStopped((o) => !o)}
                                    aria-expanded={showStopped}
                                    sx={{ mt: 1, p: 0, border: 0, background: "none", cursor: "pointer", color: "primary.main", fontWeight: 700, fontFamily: "inherit", textAlign: "left" }}
                                >
                                    {showStopped ? "Hide" : "Show"} {stopped.length} stopped container{stopped.length === 1 ? "" : "s"}
                                </Typography>
                                <Collapse in={showStopped}>
                                    {stopped.map((c) => (
                                        <ContainerRow key={c.name} c={c} />
                                    ))}
                                </Collapse>
                            </>
                        )}
                    </>
                )}
            </Box>
        </Card>
    );
}

/** Containers, memory, disk and temperature per server, from each server's own snapshot (read-only, about 5 minutes old at most). */
export default function ResourcesPanel({ resources }: { resources: NodeResources[] }) {
    if (resources.length === 0) {
        return <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>No server has reported yet.</Alert>;
    }

    return (
        <Stack spacing={2}>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" }, alignItems: "start" }}>
                {resources.map((n) => (
                    <NodeBlock key={n.name} node={n} />
                ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
                Each server runs a fixed set of read-only commands (docker ps, docker stats, df, /proc) and uploads the result every 5 minutes. This page cannot start, stop or change anything on a server.
            </Typography>
        </Stack>
    );
}
