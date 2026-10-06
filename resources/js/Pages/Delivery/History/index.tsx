import { Head, router } from "@inertiajs/react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
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
    DeliveryHero,
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
export default function DeliveryHistory({
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
                route("delivery.history.index"),
                search ? { search } : {},
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [search, filters.search]);

    return (
        <>
            <Head title="Delivery History" />

            <DeliveryHero eyebrow="Your record" title="History" subtitle="Runs you finished — and the ones that did not land.">
                <Grid container spacing={1}>
                    <Grid size={6}>
                        <StatTile onHero label="Delivered" value={metrics.delivered_total} icon={<CheckCircleRoundedIcon />} />
                    </Grid>
                    <Grid size={6}>
                        <StatTile onHero label="Failed" value={metrics.failed} icon={<ErrorRoundedIcon />} />
                    </Grid>
                </Grid>
                <TextField
                    fullWidth
                    size="small"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search past runs…"
                    sx={{
                        mt: 1.5,
                        "& .MuiOutlinedInput-root": { bgcolor: "background.paper", borderRadius: 3, "& fieldset": { border: "none" } },
                    }}
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
            </DeliveryHero>

            <Container maxWidth="sm" sx={{ pt: 2.5, pb: 4 }}>
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
                                    route("delivery.history.index"),
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
                                    route("delivery.history.index"),
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

DeliveryHistory.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
