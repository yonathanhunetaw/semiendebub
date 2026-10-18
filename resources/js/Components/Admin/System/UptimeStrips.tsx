import * as React from "react";
import { Box, Card, Chip, Stack, Typography } from "@mui/material";

import type { CellState, UptimeHistoryData, UptimeNode } from "@/types/systemStatus";
import { cardSx } from "@/Components/Admin/System/SystemParts";
import { duration } from "@/Components/Admin/System/systemFormat";

/** Status colours are reserved (never reused for a series); every state also has a word in the legend and the readout. */
const CELL: Record<CellState, { bg: string; label: string; hint: string; stripes?: boolean }> = {
    up: { bg: "success.main", label: "Up", hint: "Reported, app and database answering" },
    degraded: { bg: "warning.main", label: "Partly down", hint: "App or database was down for part of these 5 minutes" },
    down: { bg: "error.main", label: "Down", hint: "No report, or app and database not answering", stripes: true },
    deploying: { bg: "info.main", label: "Deploying", hint: "A deploy was running (counted as up)" },
    off: { bg: "action.disabledBackground", label: "Off", hint: "On-demand server switched off (expected)" },
    pending: { bg: "success.light", label: "Not uploaded yet", hint: "The newest minutes arrive within about 10 minutes" },
    unknown: { bg: "divider", label: "Not recorded", hint: "Nothing was recorded then" },
};

const LEGEND: CellState[] = ["up", "degraded", "down", "deploying", "off", "pending", "unknown"];
const stripes = "repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 2px, transparent 2px 5px)";

const clock = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const dayClock = (epoch: number) => new Date(epoch * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * One row of cells with a shared readout: pointer or arrow keys pick a cell, the line under the strip says what it was.
 * `describe` returns the words for a cell, so identity is never carried by colour alone.
 */
function Strip({
    label,
    count,
    color,
    describe,
    height = 22,
}: {
    label: string;
    count: number;
    color: (i: number) => { bg: string; stripes?: boolean };
    describe: (i: number) => string;
    height?: number;
}) {
    const [picked, setPicked] = React.useState<number | null>(null);
    const ref = React.useRef<HTMLDivElement>(null);

    const fromPointer = (clientX: number) => {
        const box = ref.current?.getBoundingClientRect();
        if (!box || box.width === 0) return;
        setPicked(Math.min(count - 1, Math.max(0, Math.floor(((clientX - box.left) / box.width) * count))));
    };

    return (
        <Box>
            <Box
                ref={ref}
                role="img"
                tabIndex={0}
                aria-label={`${label}. Use the arrow keys to read each 5 minutes.`}
                onPointerMove={(e) => fromPointer(e.clientX)}
                onPointerLeave={() => setPicked(null)}
                onFocus={() => setPicked((p) => p ?? count - 1)}
                onBlur={() => setPicked(null)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") setPicked((p) => Math.max(0, (p ?? count) - 1));
                    if (e.key === "ArrowRight") setPicked((p) => Math.min(count - 1, (p ?? -1) + 1));
                }}
                sx={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, height, borderRadius: 1, overflow: "hidden", cursor: "crosshair", touchAction: "pan-y", outlineOffset: 2 }}
            >
                {Array.from({ length: count }, (_, i) => {
                    const c = color(i);

                    return (
                        <Box
                            key={i}
                            sx={{
                                bgcolor: c.bg,
                                backgroundImage: c.stripes ? stripes : "none",
                                opacity: picked !== null && picked !== i ? 0.55 : 1,
                                outline: picked === i ? "2px solid" : "none",
                                outlineColor: "text.primary",
                                outlineOffset: -2,
                            }}
                        />
                    );
                })}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", minHeight: 20, mt: 0.5 }}>
                {picked === null ? "Point at the strip (or use the arrow keys) to read a 5-minute slot." : describe(picked)}
            </Typography>
        </Box>
    );
}

function Axis({ history }: { history: UptimeHistoryData }) {
    const cells = history.live.length;
    const marks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.min(cells - 1, Math.round(f * (cells - 1))));

    return (
        <Stack direction="row" sx={{ justifyContent: "space-between", color: "text.secondary", fontSize: "0.7rem", mt: -0.25 }}>
            {marks.map((i, k) => (
                <span key={k}>{k === marks.length - 1 ? "now" : clock(history.from + i * history.step)}</span>
            ))}
        </Stack>
    );
}

function NodeRow({ node, history }: { node: UptimeNode; history: UptimeHistoryData }) {
    const pct = node.uptime_pct;

    return (
        <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.75 }}>
                <Typography sx={{ fontWeight: 800 }}>{node.name}</Typography>
                {node.on_demand ? (
                    <Chip size="small" variant="outlined" label="on demand: off is normal" />
                ) : pct === null ? (
                    <Chip size="small" variant="outlined" label="no history yet" />
                ) : (
                    <Chip size="small" color={pct >= 99.5 ? "success" : pct >= 95 ? "warning" : "error"} label={`${pct}% up`} />
                )}
                {node.outages.length > 0 && <Chip size="small" color="error" variant="outlined" label={`${node.outages.length} outage${node.outages.length === 1 ? "" : "s"}`} />}
            </Stack>
            <Strip
                label={`${node.name}, last 24 hours`}
                count={node.cells.length}
                color={(i) => CELL[node.cells[i]]}
                describe={(i) => {
                    const state = CELL[node.cells[i]];

                    return `${node.name} · ${dayClock(history.from + i * history.step)}: ${state.label}. ${state.hint}.`;
                }}
            />
        </Box>
    );
}

/** The last 24 hours of every node, who was live, and the outages as a list (the text twin of the strips). */
export default function UptimeStrips({ history }: { history: UptimeHistoryData }) {
    const order = history.nodes.map((n) => n.name);
    const livePalette = ["primary.main", "secondary.main", "success.dark", "info.dark"];
    const liveColor = (who: string | null): { bg: string; stripes?: boolean } =>
        who === null ? { bg: "divider" } : who === "multiple" ? { bg: "error.main", stripes: true } : { bg: livePalette[order.indexOf(who) % livePalette.length] ?? "primary.main" };

    const outages = history.nodes
        .flatMap((n) => n.outages.map((o) => ({ ...o, node: n.name })))
        .sort((a, b) => b.from - a.from);
    const commits = history.nodes
        .flatMap((n) => n.commits.map((c) => ({ ...c, node: n.name })))
        .sort((a, b) => b.ts - a.ts);

    return (
        <Card sx={cardSx}>
            <Stack spacing={2.5}>
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
                        Who took the visitors
                    </Typography>
                    <Strip
                        label="Which server's Cloudflare tunnel was up"
                        count={history.live.length}
                        color={(i) => liveColor(history.live[i])}
                        describe={(i) => {
                            const who = history.live[i];
                            const when = dayClock(history.from + i * history.step);

                            if (who === null) return `${when}: no server reported its tunnel up.`;
                            if (who === "multiple") return `${when}: more than one tunnel was up, so visitors were split between servers.`;

                            return `${when}: ${who} had its tunnel up (took the visitors).`;
                        }}
                        height={16}
                    />
                    <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: "wrap" }}>
                        {order.map((name, i) => (
                            <Stack key={name} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: livePalette[i % livePalette.length] }} />
                                <Typography variant="caption">{name}</Typography>
                            </Stack>
                        ))}
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: "error.main", backgroundImage: stripes }} />
                            <Typography variant="caption">two tunnels at once</Typography>
                        </Stack>
                    </Stack>
                </Box>

                {history.nodes.map((n) => (
                    <NodeRow key={n.name} node={n} history={history} />
                ))}
                <Axis history={history} />

                <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                    {LEGEND.map((s) => (
                        <Stack key={s} direction="row" spacing={0.5} sx={{ alignItems: "center" }} title={CELL[s].hint}>
                            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: CELL[s].bg, backgroundImage: CELL[s].stripes ? stripes : "none" }} />
                            <Typography variant="caption">{CELL[s].label}</Typography>
                        </Stack>
                    ))}
                </Stack>

                <Box sx={{ pt: 1.5, borderTop: "1px dashed", borderColor: "divider" }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                        Outages in the last 24 hours
                    </Typography>
                    {outages.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            None recorded. A server that is not on demand and sent nothing for 5 minutes would show here.
                        </Typography>
                    ) : (
                        outages.map((o, i) => (
                            <Typography key={i} variant="body2" color={o.ongoing ? "error.main" : "text.primary"}>
                                <b>{o.node}</b> · from {dayClock(o.from)} · {o.ongoing ? `still silent, ${duration(o.minutes * 60)} so far` : duration(o.minutes * 60)}
                            </Typography>
                        ))
                    )}
                    {commits.length > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            Code changes:{" "}
                            {commits.map((c) => `${c.node} ${c.from} → ${c.to} at ${clock(c.ts)}`).join(" · ")}
                        </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                        Each server records one note a minute and uploads them about every 10 minutes, so the newest minutes can lag. "% up" counts only slots that were recorded; a slot with no note is never counted as up.
                    </Typography>
                </Box>
            </Stack>
        </Card>
    );
}
