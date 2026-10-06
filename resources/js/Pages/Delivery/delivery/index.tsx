import { Head, router, useForm } from "@inertiajs/react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import {
    Alert,
    Button,
    Chip,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    InputAdornment,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    DeliveryHero,
    EmptyRuns,
    RunCard,
    SectionTitle,
    StatTile,
    TRANSITION_LABELS,
} from "@/Components/Delivery/deliveryUi";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import type {
    DeliveryRun,
    DeliveryRunsProps,
    DeliveryStatus,
} from "@/types/delivery";

const SEARCH_DEBOUNCE_MS = 350;

const STATUS_TABS: Array<{ value: string; label: string }> = [
    { value: "open", label: "Open" },
    { value: "pending", label: "To collect" },
    { value: "dispatched", label: "Collected" },
    { value: "in_transit", label: "In transit" },
    { value: "delivered", label: "Delivered" },
    { value: "all", label: "All" },
];

/**
 * The courier's run list.
 *
 * Which buttons appear on a run comes from `allowed_transitions`, which the
 * server derives from the lifecycle — the UI never invents a move the backend
 * would refuse.
 */
export default function Runs({
    deliveries,
    available_runs: availableRuns,
    metrics,
    filters,
    pagination,
    flash,
}: DeliveryRunsProps): React.ReactElement {
    const [search, setSearch] = React.useState<string>(filters.search);
    const [failing, setFailing] = React.useState<DeliveryRun | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        setSearch(filters.search);
    }, [filters.search]);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) {
            setNotice(message);
        }
    }, [flash?.success, flash?.error]);

    const applyFilters = React.useCallback(
        (next: { status?: string; search?: string }): void => {
            router.get(
                route("delivery.delivery.index"),
                {
                    status: next.status ?? filters.status,
                    ...((next.search ?? filters.search)
                        ? { search: next.search ?? filters.search }
                        : {}),
                },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        },
        [filters.status, filters.search],
    );

    React.useEffect(() => {
        if (search === filters.search) {
            return;
        }

        const timer = window.setTimeout(() => applyFilters({ search }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [search, filters.search, applyFilters]);

    const advance = (run: DeliveryRun, status: DeliveryStatus): void => {
        if (status === "failed") {
            setFailing(run);
            return;
        }

        router.patch(
            route("delivery.delivery.transition", run.id),
            { status },
            { preserveScroll: true },
        );
    };

    const claim = (run: DeliveryRun): void => {
        router.post(route("delivery.delivery.claim", run.id), {}, { preserveScroll: true });
    };

    return (
        <>
            <Head title="My Deliveries" />

            <DeliveryHero
                eyebrow="Last mile"
                title="My deliveries"
                subtitle={
                    metrics.open > 0
                        ? `${metrics.open} open run${metrics.open === 1 ? "" : "s"} — keep it moving.`
                        : "All caught up."
                }
            >
                <Grid container spacing={1}>
                    <Grid size={4}>
                        <StatTile onHero label="Open" value={metrics.open} icon={<PendingActionsRoundedIcon />} />
                    </Grid>
                    <Grid size={4}>
                        <StatTile onHero label="Done today" value={metrics.delivered_today} icon={<CheckCircleRoundedIcon />} />
                    </Grid>
                    <Grid size={4}>
                        <StatTile onHero label="In pool" value={metrics.unassigned} icon={<InboxRoundedIcon />} />
                    </Grid>
                </Grid>
                <TextField
                    fullWidth
                    size="small"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, phone, address or tracking…"
                    sx={{
                        mt: 1.5,
                        "& .MuiOutlinedInput-root": {
                            bgcolor: "background.paper",
                            borderRadius: 3,
                            "& fieldset": { border: "none" },
                        },
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

            <Container maxWidth="sm" sx={{ pt: 2, pb: 4 }}>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mb: 2, overflowX: "auto", pb: 0.5, mx: -2, px: 2, "&::-webkit-scrollbar": { display: "none" } }}
                >
                    {STATUS_TABS.map((tab) => {
                        const active = filters.status === tab.value;
                        return (
                            <Chip
                                key={tab.value}
                                label={tab.label}
                                onClick={() => applyFilters({ status: tab.value })}
                                color={active ? "primary" : "default"}
                                variant={active ? "filled" : "outlined"}
                                sx={{ fontWeight: 700, flexShrink: 0, borderRadius: 2.5, height: 34, px: 0.5 }}
                            />
                        );
                    })}
                </Stack>

                <SectionTitle title="Your runs" count={deliveries.length} />

                {/* ── Assigned runs ── */}
                <Stack spacing={1.5} sx={{ mb: 3 }}>
                    {deliveries.length === 0 ? (
                        <EmptyRuns
                            title="No runs in this view"
                            hint="Try another filter, or claim one from the pool below."
                        />
                    ) : (
                        deliveries.map((run) => (
                            <RunCard
                                key={run.id}
                                run={run}
                                actions={
                                    run.allowed_transitions.length > 0 ? (
                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                            {run.allowed_transitions
                                                .filter((status) => status in TRANSITION_LABELS)
                                                .map((status) => (
                                                    <Button
                                                        key={status}
                                                        size="medium"
                                                        sx={{ borderRadius: 2.5, fontWeight: 800, flex: 1 }}
                                                        variant={
                                                            status === "failed"
                                                                ? "outlined"
                                                                : "contained"
                                                        }
                                                        color={
                                                            status === "failed"
                                                                ? "error"
                                                                : status === "delivered"
                                                                  ? "success"
                                                                  : "primary"
                                                        }
                                                        onClick={() => advance(run, status)}
                                                    >
                                                        {TRANSITION_LABELS[status]}
                                                    </Button>
                                                ))}
                                        </Stack>
                                    ) : null
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
                        sx={{ mb: 3 }}
                    >
                        <Button
                            disabled={pagination.current_page <= 1}
                            onClick={() =>
                                router.get(
                                    route("delivery.delivery.index"),
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
                                    route("delivery.delivery.index"),
                                    { ...filters, page: pagination.current_page + 1 },
                                    { preserveState: true },
                                )
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}

                {/* ── Pool ── */}
                {availableRuns.length > 0 ? (
                    <>
                        <SectionTitle title="Available to claim" count={availableRuns.length} />
                        <Stack spacing={1.5}>
                            {availableRuns.map((run) => (
                                <RunCard
                                    key={run.id}
                                    run={run}
                                    actions={
                                        <Button
                                            variant="contained"
                                            size="large"
                                            fullWidth
                                            sx={{ borderRadius: 2.5, fontWeight: 800 }}
                                            onClick={() => claim(run)}
                                        >
                                            Claim this run
                                        </Button>
                                    }
                                />
                            ))}
                        </Stack>
                    </>
                ) : null}
            </Container>

            <ReportProblemDialog run={failing} onClose={() => setFailing(null)} />

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                sx={{ bottom: { xs: 88 } }}
            >
                <Alert
                    severity={flash?.error ? "error" : "success"}
                    variant="filled"
                    onClose={() => setNotice(null)}
                >
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

/**
 * A failed run must record why, so the desk can follow up.
 */
function ReportProblemDialog({
    run,
    onClose,
}: {
    run: DeliveryRun | null;
    onClose: () => void;
}): React.ReactElement {
    const { data, setData, patch, processing, errors, reset } = useForm<{
        status: string;
        failure_reason: string;
    }>({
        status: "failed",
        failure_reason: "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        if (!run) {
            return;
        }

        patch(route("delivery.delivery.transition", run.id), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                onClose();
            },
        });
    };

    return (
        <Dialog open={run !== null} onClose={onClose} fullWidth maxWidth="xs">
            <form onSubmit={submit}>
                <DialogTitle sx={{ fontWeight: 800 }}>Report a problem</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {run?.recipient_name} · {run?.tracking_number ?? `Run #${run?.id}`}
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        label="What went wrong?"
                        value={data.failure_reason}
                        onChange={(event) => setData("failure_reason", event.target.value)}
                        error={Boolean(errors.failure_reason)}
                        helperText={
                            errors.failure_reason ?? "e.g. nobody home, wrong address, refused"
                        }
                        multiline
                        rows={3}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        type="submit"
                        variant="contained"
                        color="error"
                        disabled={processing}
                    >
                        Report
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

Runs.layout = (page: React.ReactNode) => <DeliveryLayout>{page}</DeliveryLayout>;
