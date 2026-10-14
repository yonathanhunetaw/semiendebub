import * as React from "react";
import { Head, router } from "@inertiajs/react";
import { Alert, Box, Stack, Typography } from "@mui/material";

import AdminLayout from "@/Layouts/AdminLayout";
import { AlertList, DataLossPanel, LiveBanner, NodeCards, Timeline } from "@/Components/Admin/System/SystemParts";
import type { SystemStatusSnapshot } from "@/types/systemStatus";

interface SystemStatusProps {
    configured?: boolean;
    status?: SystemStatusSnapshot | null;
    error?: string | null;
}

const REFRESH_MS = 15000;

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

export default function Index({ configured = false, status = null, error = null }: SystemStatusProps): React.ReactElement {
    // Read-only page: poll for fresh data, nothing here changes anything.
    React.useEffect(() => {
        if (!configured) return undefined;

        const id = window.setInterval(() => router.reload({ only: ["status", "error"] }), REFRESH_MS);

        return () => window.clearInterval(id);
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
                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                        This server has no backup-bucket credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT), so it cannot read the status.
                    </Alert>
                )}
                {error && (
                    <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>
                        {error}
                    </Alert>
                )}
                {configured && !error && status?.empty && (
                    <Alert severity="warning" variant="outlined" sx={{ borderRadius: 3 }}>
                        The backup bucket answered but holds no status files yet. They appear after the backup and sync jobs run once on each server.
                    </Alert>
                )}

                {status && !status.empty && (
                    <>
                        <LiveBanner status={status} />
                        <AlertList alerts={status.alerts} />

                        <Section title="Servers" hint="Each server reports once a minute. A server that is off or on demand is not a problem.">
                            <NodeCards nodes={status.nodes} youAre={status.this_node.name} />
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
