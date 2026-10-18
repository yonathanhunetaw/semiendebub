import * as React from "react";
import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";

import type { SystemNode, SystemStatusSnapshot } from "@/types/systemStatus";
import { cardSx } from "@/Components/Admin/System/SystemParts";
import { TIMINGS, ago, duration } from "@/Components/Admin/System/systemFormat";

type Level = "ok" | "warn" | "error" | "info";

interface Verdict {
    level: Level;
    title: string;
    lines: string[];
}

const chipColor: Record<Level, "success" | "warning" | "error" | "info"> = { ok: "success", warn: "warning", error: "error", info: "info" };

/** What a server's data position means, in words. Old heartbeats lack the sync fields: then it says "cannot tell", never "fine". */
function verdict(n: SystemNode): Verdict {
    if (n.status === "off") {
        return { level: "info", title: "Off (on demand)", lines: ["It catches up from R2 when you run make prod on it."] };
    }
    if (n.status === "offline" || n.status === "stale") {
        return { level: "warn", title: "Not reporting", lines: [`Last heard ${ago(n.last_seen_age)}. Its sync state is unknown.`] };
    }

    if (n.is_live) {
        const changed = n.tables_changed;
        const lines: string[] = [`Last backup upload ${ago(n.last_backup_age)}. Backups run every ${TIMINGS.backupEveryMin} min and are skipped while nothing changed.`];

        if (changed === null) {
            return { level: "info", title: "Cannot tell what is unsaved", lines: [...lines, "This server did not report which tables changed (old scripts, or its database did not answer)."] };
        }
        if (changed.count === 0) {
            return { level: "ok", title: "Nothing waiting for a backup", lines: [...lines, `No table was written since its last dump (${ago(n.dump_age)}).`] };
        }
        const stale = (n.dump_age ?? 0) > 900;

        return {
            level: stale ? "warn" : "ok",
            title: `${changed.count} table${changed.count === 1 ? "" : "s"} written since the last dump`,
            lines: [
                ...lines,
                `Last dump taken ${ago(n.dump_age)}. Tables: ${changed.names.join(", ")}${changed.count > changed.names.length ? ", …" : ""}.`,
                stale
                    ? "That is longer than a backup cycle: if this server failed now, these changes would be lost."
                    : `Normal while the shop is busy. If this server failed now, at most the last ${TIMINGS.backupEveryMin} minutes of changes would be lost.`,
            ],
        };
    }

    // A server that follows the live one.
    const lines: string[] = [`Last good restore ${ago(n.last_restore_age)}.`];

    if (n.restore_failures > 0) lines.push(`${n.restore_failures} restore${n.restore_failures === 1 ? "" : "s"} failed in a row. Its sync job retries every minute; its database may be partly loaded until one succeeds.`);

    if (n.in_sync) {
        return { level: n.restore_failures > 0 ? "warn" : "ok", title: "Has the newest backup", lines };
    }

    const behind = n.behind_for;
    const long = behind !== null && behind >= 600;

    return {
        level: n.restore_failures >= 3 ? "error" : long ? "warn" : "info",
        title: behind === null ? "Does not match the newest backup" : `Behind for ${duration(behind)}`,
        lines: [...lines, long ? "A short lag is normal right after a backup. This is longer: look at its sync log." : "Normal for a minute or two after each backup upload."],
    };
}

/** Ubuntu → standby: has each server got the newest data, did a restore fail, and what is not in any backup yet. */
export default function SyncPanel({ status }: { status: SystemStatusSnapshot }) {
    const { latest_backup: backup, live_node: live, nodes } = status;

    return (
        <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
                {live ?? "No live server"} <ArrowForwardRounded fontSize="inherit" /> backup in R2{backup ? ` (${ago(backup.age)})` : ""} <ArrowForwardRounded fontSize="inherit" /> every other server. Data travels as database backups, not live copies.
            </Typography>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
                {nodes.map((n) => {
                    const v = verdict(n);

                    return (
                        <Card key={n.name} sx={{ ...cardSx, borderColor: v.level === "error" ? "error.main" : v.level === "warn" ? "warning.main" : "divider" }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
                                <Typography sx={{ fontWeight: 800 }}>{n.name}</Typography>
                                <Chip size="small" variant="outlined" label={n.is_live ? "live: source of the data" : "follows the live server"} />
                                <Chip size="small" color={chipColor[v.level]} label={v.title} />
                            </Stack>
                            {v.lines.map((line, i) => (
                                <Typography key={i} variant="body2" color="text.secondary">
                                    {line}
                                </Typography>
                            ))}
                        </Card>
                    );
                })}
            </Box>
            <Typography variant="caption" color="text.secondary">
                "Tables written" is read from the database's own change times. They are kept in memory, so a database restart forgets older writes: treat the list as a minimum, not proof that nothing changed.
            </Typography>
        </Stack>
    );
}
