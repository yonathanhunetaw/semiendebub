import * as React from "react";
import { Deferred, Head, router } from "@inertiajs/react";
import { Alert, Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";

import AdminLayout from "@/Layouts/AdminLayout";
import { AlertList, DataLossPanel, LiveBanner, NodeCards, Timeline } from "@/Components/Admin/System/SystemParts";
import HowItWorks from "@/Components/Admin/System/HowItWorks";
import ResourcesPanel from "@/Components/Admin/System/ResourcesPanel";
import SyncPanel from "@/Components/Admin/System/SyncPanel";
import UptimeStrips from "@/Components/Admin/System/UptimeStrips";
import type { RelatedLink, SystemStatusSnapshot, UptimeHistoryData } from "@/types/systemStatus";

interface SystemStatusProps {
    configured?: boolean;
    status?: SystemStatusSnapshot | null;
    error?: string | null;
    /** Deferred: arrives a moment after the page. null = no nodes reported yet or the bucket could not be read. */
    history?: UptimeHistoryData | null;
    links?: RelatedLink[];
}

const REFRESH_MS = 15000;
const HISTORY_REFRESH_MS = 60000;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <Box>
            <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>{title}</Typography>
            {hint && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {hint}
                </Typography>
            )}
            {children}
        </Box>
    );
}

export default function Index({ configured = false, status = null, error = null, history = null, links = [] }: SystemStatusProps): React.ReactElement {
    // Read-only page: poll for fresh data, nothing here changes anything.
    React.useEffect(() => {
        if (!configured) return undefined;

        const id = window.setInterval(() => router.reload({ only: ["status", "error"] }), REFRESH_MS);

        // The strips change slowly (a cell is 5 minutes), so they refresh less often.
        const historyId = window.setInterval(() => router.reload({ only: ["history"] }), HISTORY_REFRESH_MS);

        return () => {
            window.clearInterval(id);
            window.clearInterval(historyId);
        };
    }, [configured]);

    return (
        <>
            <Head title="System status" />
            <Stack spacing={3} sx={{ p: { xs: 1, md: 2 }, maxWidth: 1100 }}>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        System status
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Which server is live, how each one is doing, and what happened when they took over from each other.
                        {status ? ` You are looking at ${status.this_node.name || "this server"}${status.this_node.role ? ` (${status.this_node.role})` : ""}. Refreshes by itself.` : ""}
                    </Typography>
                </Box>

                {!configured && (
                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                        This server has no backup-bucket credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT), so it cannot read the status.
                    </Alert>
                )}
                {error && (
                    <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}
                {configured && !error && status?.empty && (
                    <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                        The backup bucket answered but holds no status files yet. They appear after the backup and sync jobs run once on each server.
                    </Alert>
                )}

                {status && !status.empty && (
                    <>
                        <LiveBanner status={status} />
                        <AlertList alerts={status.alerts} />

                        {links.length > 0 && (
                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, alignItems: "center" }}>
                                <Typography variant="body2" color="text.secondary">
                                    Related tools:
                                </Typography>
                                {links.map((l) => (
                                    <Button key={l.url} size="small" variant="outlined" href={l.url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded fontSize="small" />}>
                                        {l.label}
                                    </Button>
                                ))}
                            </Stack>
                        )}

                        <Section
                            title="Last 24 hours"
                            hint="Each server's day in 5-minute slots, and which server took the visitors. A slot with no report is shown as down or not recorded, never as up."
                        >
                            <Deferred data="history" fallback={<Skeleton variant="rounded" height={220} />}>
                                {history ? (
                                    <UptimeStrips history={history} />
                                ) : (
                                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                        No history yet. It starts filling about 10 minutes after the updated backup scripts run on each server.
                                    </Alert>
                                )}
                            </Deferred>
                        </Section>

                        <Section title="Data between servers" hint="Whether each server has the newest data, whether a restore failed, and what the live server has written that is not in a backup yet.">
                            <SyncPanel status={status} />
                        </Section>

                        <Section title="Servers' resources" hint="Containers, memory, disk and temperature of each server. Read-only: each server reports its own numbers.">
                            <ResourcesPanel resources={status.resources ?? []} />
                        </Section>

                        <HowItWorks status={status} />

                        <Section title="Servers" hint="Each server reports once a minute. A server that is off or on demand is not a problem.">
                            <NodeCards nodes={status.nodes} youAre={status.this_node.name} status={status} />
                        </Section>

                        <Section
                            title="Possible data loss"
                            hint="Every time a server's data was replaced by another server's backup in the last 30 days, and how many rows differed."
                        >
                            <DataLossPanel events={status.data_events} />
                        </Section>

                        <Section title="What happened" hint="The latest events from all servers, newest first.">
                            <Timeline events={status.events} nodes={status.nodes.map((n) => n.name)} />
                        </Section>
                    </>
                )}
            </Stack>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
