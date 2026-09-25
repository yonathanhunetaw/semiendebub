import { Head, router } from "@inertiajs/react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Button,
    Container,
    Grid,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    EmptyRuns,
    RunCard,
    StatTile,
    formatMoment,
} from "@/Components/Delivery/deliveryUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type { DeliveryShipmentsProps } from "@/types/delivery";

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Closed runs for this courier — what landed, and what did not.
 */
export default function Shipments({
    shipments,
    metrics,
    filters,
    pagination,
}: DeliveryShipmentsProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);

    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    React.useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => {
            router.get(
                route("delivery.shipments.index"),
                search ? { search } : {},
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [search, filters.search]);

    return (
        <>
            <Head title="Shipment History" />

            <Container sx={{ pt: 3, pb: 10 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
                    Shipment History
                </Typography>

                <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
                    <Grid size={6}>
                        <StatTile
                            label="Delivered"
                            value={metrics.delivered_total}
                            tone="success"
                        />
                    </Grid>
                    <Grid size={6}>
                        <StatTile
                            label="Failed"
                            value={metrics.failed}
                            tone={metrics.failed > 0 ? "danger" : "default"}
                        />
                    </Grid>
                </Grid>

                <TextField
                    fullWidth
                    size="small"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search past runs…"
                    sx={{ mb: 2 }}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchRoundedIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        },
                    }}
                />

                <Stack spacing={1.5}>
                    {shipments.length === 0 ? (
                        <EmptyRuns
                            title="No completed runs yet"
                            hint="Runs you finish will be listed here."
                        />
                    ) : (
                        shipments.map((run) => (
                            <RunCard
                                key={run.id}
                                run={run}
                                actions={
                                    <Typography variant="caption" color="text.secondary">
                                        {run.status === "delivered"
                                            ? `Delivered ${formatMoment(run.delivered_at)}`
                                            : run.status === "failed"
                                              ? `Failed ${formatMoment(run.failed_at)}`
                                              : `Closed ${formatMoment(run.created_at)}`}
                                    </Typography>
                                }
                            />
                        ))
                    )}
                </Stack>

                {pagination.last_page > 1 ? (
                    <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="center"
                        sx={{ mt: 3 }}
                    >
                        <Button
                            disabled={pagination.current_page <= 1}
                            onClick={() =>
                                router.get(
                                    route("delivery.shipments.index"),
                                    { ...filters, page: pagination.current_page - 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Previous
                        </Button>
                        <Typography variant="caption" color="text.secondary">
                            {pagination.current_page} / {pagination.last_page}
                        </Typography>
                        <Button
                            disabled={pagination.current_page >= pagination.last_page}
                            onClick={() =>
                                router.get(
                                    route("delivery.shipments.index"),
                                    { ...filters, page: pagination.current_page + 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </Container>
        </>
    );
}

Shipments.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
