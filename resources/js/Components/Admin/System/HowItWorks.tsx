import * as React from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Card, Chip, Collapse, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import ExpandMore from "@mui/icons-material/ExpandMore";

import type { SystemNode, SystemStatusSnapshot } from "@/types/systemStatus";
import { cardSx } from "@/Components/Admin/System/SystemParts";
import { TIMINGS } from "@/Components/Admin/System/systemFormat";

const OPEN_KEY = "duka.system.howItWorks.open";

function readOpen(): boolean {
    try {
        return window.localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
        return true;
    }
}

function Code({ children }: { children: React.ReactNode }) {
    return (
        <Box component="code" sx={{ px: 0.6, py: 0.1, borderRadius: 1, bgcolor: "action.hover", fontSize: "0.85em", overflowWrap: "anywhere" }}>
            {children}
        </Box>
    );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Box>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>{title}</Typography>
            {children}
        </Box>
    );
}

/** One server box in the picture, coloured by its real connector state. */
function ServerBox({ node }: { node: SystemNode }) {
    const on = node.tunnel === "on";
    const unguarded = node.tunnel === "";

    return (
        <Box
            sx={{
                flex: "1 1 120px",
                minWidth: 0,
                p: 1.5,
                borderRadius: 2,
                border: "2px solid",
                borderColor: on ? "success.main" : unguarded ? "warning.main" : "divider",
                textAlign: "center",
                opacity: node.status === "off" ? 0.6 : 1,
            }}
        >
            <Typography sx={{ fontWeight: 800 }}>{node.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {node.role}
                {node.on_demand ? " · on demand" : ""}
            </Typography>
            <Chip
                size="small"
                sx={{ mt: 0.75 }}
                color={on ? "success" : unguarded ? "warning" : "default"}
                variant={on ? "filled" : "outlined"}
                label={on ? "tunnel ON" : unguarded ? "tunnel unguarded" : "tunnel off"}
            />
            {node.is_live && (
                <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 0.5, fontWeight: 700 }}>
                    holds the lease
                </Typography>
            )}
        </Box>
    );
}

function Picture({ nodes }: { nodes: SystemNode[] }) {
    const pill = { px: 2, py: 1, borderRadius: 2, border: "1px solid", borderColor: "divider", textAlign: "center" } as const;

    return (
        <Stack spacing={1} sx={{ alignItems: "stretch" }}>
            <Box sx={pill}>
                <Typography sx={{ fontWeight: 700 }}>Visitors</Typography>
            </Box>
            <ArrowDownwardRounded sx={{ alignSelf: "center" }} color="action" />
            <Box sx={pill}>
                <Typography sx={{ fontWeight: 700 }}>Cloudflare (one tunnel)</Typography>
                <Typography variant="caption" color="text.secondary">
                    sends each visitor to <b>any</b> server whose connector is on
                </Typography>
            </Box>
            <ArrowDownwardRounded sx={{ alignSelf: "center" }} color="action" />
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                {nodes.map((n) => (
                    <ServerBox key={n.name} node={n} />
                ))}
            </Stack>
            <ArrowDownwardRounded sx={{ alignSelf: "center" }} color="action" />
            <Box sx={pill}>
                <Typography sx={{ fontWeight: 700 }}>R2 backup bucket</Typography>
                <Typography variant="caption" color="text.secondary">
                    the lease (who is live) · database backups · each server's heartbeat · the event log
                </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
                Live picture: the boxes show each server's real connector state. Each server has its own database; only the live one is the truth, the
                others copy it from the backups.
            </Typography>
        </Stack>
    );
}

const JOBS: { job: string; every: string; where: string; does: string }[] = [
    {
        job: "backup-db.sh",
        every: `every ${TIMINGS.backupEveryMin} min`,
        where: "all",
        does: "On the live server only: dumps the database to R2 and refreshes the lease. The other servers do nothing here.",
    },
    {
        job: "sync-db.sh",
        every: "every minute",
        where: "all",
        does: "Writes this server's heartbeat. On a standby: loads each new backup. On the main server after a takeover: loads the standby's last backup and takes the lease back.",
    },
    {
        job: "tunnel-guard.sh",
        every: "every minute",
        where: "all",
        does: `Turns this server's Cloudflare connector on only if it holds the lease. Fails over (standby) when the live server is silent for ${TIMINGS.failoverMin} min or its app is down, and hands back when the main server returns.`,
    },
    {
        job: "auto-deploy.sh",
        every: "every 2 min",
        where: "standby (pi)",
        does: "Sees the commit the live server deployed, fast-forwards to it and deploys. Never while it is the live server.",
    },
];

const SCENARIOS: { title: string; steps: React.ReactNode[] }[] = [
    {
        title: "A normal day",
        steps: [
            "ubuntu holds the lease and its tunnel is on: every visitor goes to ubuntu.",
            `Every ${TIMINGS.backupEveryMin} min ubuntu uploads a backup; within a minute the pi loads it.`,
            "The pi's tunnel stays off, so nobody ever lands on it.",
        ],
    },
    {
        title: "You deploy",
        steps: [
            <>
                Push from the Mac, then on ubuntu: <Code>git pull && make prod</Code>.
            </>,
            "The deploy marks ubuntu as deploying. Its app restarts for about 2 minutes: visitors see errors for that time, the pi does not take over.",
            "At the end ubuntu publishes the commit to R2 and clears the mark.",
            "Within 2 minutes the pi's auto-deploy fast-forwards to that commit and deploys it (its tunnel stays off).",
            `If a deploy hangs, the mark expires after ${TIMINGS.deployGraceMin} min and normal failover applies again.`,
        ],
    },
    {
        title: "ubuntu goes down",
        steps: [
            `ubuntu stops reporting (or its app stops answering outside a deploy). After ${TIMINGS.failoverMin} min the pi's guard checks its data is the newest backup and its app answers.`,
            "The pi claims the lease and turns its tunnel on: visitors now go to the pi.",
            `Writes made on ubuntu since its last backup (up to ${TIMINGS.backupEveryMin} min) are not on the pi. From now on the pi uploads the backups.`,
            "If the pi's data is behind, it refuses to take over (event: Could not take over) and nobody serves: run make restore on a server.",
        ],
    },
    {
        title: "ubuntu comes back",
        steps: [
            "ubuntu reports healthy again; its tunnel stays off because the pi holds the lease.",
            "The pi hands back: tunnel off (no new writes), one last backup, lease released.",
            `ubuntu's sync loads that backup (safety dump first), takes the lease and its guard turns its tunnel on. About 1 to 2 min with nobody serving; ubuntu waits up to ${TIMINGS.handbackMaxMin} min for the hand-back.`,
        ],
    },
    {
        title: "You serve from the Mac",
        steps: [
            <>
                <Code>make prod</Code> on the Mac takes over on purpose: it claims a pinned lease and connects its tunnel; ubuntu and the pi turn theirs off within a minute.
            </>,
            <>
                <Code>make prod-stop</Code> hands back: tunnel off, last backup, lease released, containers stopped. ubuntu loads that backup and goes live.
            </>,
        ],
    },
];

const COMMANDS: [string, string][] = [
    ["make prod", "Deploy here (build, migrate, restart). Keeps the database. On the Mac it takes over."],
    ["make restore", "Deploy and replace the database with the newest R2 backup (a safety dump first)."],
    ["make prod-status", "This page in the terminal: who is live, each server, data loss, events."],
    ["make prod-stop", "Stop serving from this server cleanly and hand back."],
    ["make tunnel ARGS=--dry-run", "Print what the tunnel guard would do on this server, change nothing."],
    ["deploy/logs/*.log", "backup.log, sync.log, tunnel.log, auto-deploy.log and one log per deploy, on each server."],
];

/** The whole mechanism explained, with the current servers drawn in. */
export default function HowItWorks({ status }: { status: SystemStatusSnapshot }) {
    const [open, setOpen] = React.useState(readOpen);

    const toggle = () =>
        setOpen((o) => {
            try {
                window.localStorage.setItem(OPEN_KEY, o ? "0" : "1");
            } catch {
                // private window: just do not remember
            }

            return !o;
        });

    return (
        <Card sx={cardSx}>
            <Stack direction="row" onClick={toggle} sx={{ alignItems: "center", cursor: "pointer" }} role="button" aria-expanded={open}>
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>How it works</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Three servers, one live at a time: who takes visitors, how backups follow, and what happens on a deploy or an outage.
                    </Typography>
                </Box>
                <ExpandMore sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </Stack>

            <Collapse in={open}>
                <Stack spacing={3} sx={{ mt: 2 }}>
                    <Sub title="The picture">
                        <Picture nodes={status.nodes} />
                    </Sub>

                    <Sub title="Why only one tunnel may be on">
                        <Typography variant="body2">
                            Cloudflare does <b>not</b> fail over between servers by itself. When the same tunnel is connected from two servers (free, no load
                            balancer needed), it spreads visitors over both, and it only checks that a connector is connected, not that the app behind it works.
                            Each server has its own database and sessions, so visitors would be signed out at random and anything saved on the standby would be
                            wiped by its next sync. That is why the tunnel guard keeps the connector on <b>only on the server holding the lease</b>.
                        </Typography>
                    </Sub>

                    <Sub title="The jobs on each server (cron)">
                        <Box sx={{ overflowX: "auto" }}>
                            <Table size="small" sx={{ minWidth: 560 }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Job</TableCell>
                                        <TableCell>How often</TableCell>
                                        <TableCell>Where</TableCell>
                                        <TableCell>What it does</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {JOBS.map((j) => (
                                        <TableRow key={j.job}>
                                            <TableCell>
                                                <Code>{j.job}</Code>
                                            </TableCell>
                                            <TableCell sx={{ whiteSpace: "nowrap" }}>{j.every}</TableCell>
                                            <TableCell sx={{ whiteSpace: "nowrap" }}>{j.where}</TableCell>
                                            <TableCell>{j.does}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            The lease is a note in R2 saying which server is live; it stays valid {TIMINGS.leaseMin} min without a refresh. The heartbeat is each
                            server's "I am alive" report, sent every minute: the Servers cards below are built from it.
                        </Typography>
                    </Sub>

                    <Sub title="What happens when…">
                        {SCENARIOS.map((s) => (
                            <Accordion key={s.title} disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", "&:before": { display: "none" }, "&:not(:last-of-type)": { borderBottom: 0 } }}>
                                <AccordionSummary expandIcon={<ExpandMore />}>
                                    <Typography sx={{ fontWeight: 700 }}>{s.title}</Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ pt: 0 }}>
                                    <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                                        {s.steps.map((step, i) => (
                                            <Typography key={i} component="li" variant="body2" sx={{ mb: 0.5 }}>
                                                {step}
                                            </Typography>
                                        ))}
                                    </Box>
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Sub>

                    <Sub title="Commands (run them in the app folder)">
                        <Stack spacing={0.75}>
                            {COMMANDS.map(([cmd, what]) => (
                                <Stack key={cmd} direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.25, sm: 1.5 }}>
                                    <Box sx={{ minWidth: { sm: 230 } }}>
                                        <Code>{cmd}</Code>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        {what}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Sub>
                </Stack>
            </Collapse>
        </Card>
    );
}
