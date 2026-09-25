import { Head, Link, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import {
    Alert,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React from "react";

import {
    LoadBar,
    ShipmentCard,
    ShipmentRouteHeader,
    TransitionBar,
    formatMoment,
} from "@/Components/Shipment/shipmentUi";
import SellerLayout from "@/Layouts/SellerLayout";
import type { SellerShipmentIndexProps } from "@/types/shipment";

/**
 * The seller's shipments.
 *
 * Inbound is stock heading to their store — they confirm receipt, which is the
 * action that puts the units on their books. Outbound is stock leaving.
 *
 * Previously this page rendered hardcoded demo transfers; it now reads the
 * shared `shipments` domain.
 */
export default function SellerShipments({
    shipments,
    filters,
    counts,
    stores,
    own_store_id: ownStoreId,
    pagination,
    flash,
}: SellerShipmentIndexProps): React.ReactElement {
    const [requestOpen, setRequestOpen] = React.useState(false);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    return (
        <>
            <Head title="Shipments">
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                />
            </Head>

            <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <div className="flex items-center gap-1.5">
                    <span
                        className="material-symbols-outlined text-[#c2410c] text-[20px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                        local_shipping
                    </span>
                    <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">
                        Shipments
                    </h1>
                </div>

                <button
                    onClick={() => setRequestOpen(true)}
                    className="flex items-center gap-1 bg-orange-50 text-[#c2410c] px-3 py-1.5 rounded-full border border-orange-200/60 active:scale-95 transition-transform hover:bg-orange-100"
                >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span className="font-bold text-[11px] tracking-wide">REQUEST</span>
                </button>
            </div>

            <div className="px-3.5 pt-3 pb-24 space-y-3">
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                    {[
                        { value: "inbound", label: `Inbound (${counts.inbound})` },
                        { value: "outbound", label: `Outbound (${counts.outbound})` },
                    ].map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() =>
                                router.get(
                                    route("seller.shipments.index"),
                                    { direction: tab.value },
                                    { preserveState: true, preserveScroll: true, replace: true },
                                )
                            }
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 transition-colors border ${
                                filters.direction === tab.value
                                    ? "bg-[#c2410c] text-white border-[#c2410c]"
                                    : "bg-white text-slate-600 border-slate-200"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {counts.awaiting_receipt > 0 ? (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                        {counts.awaiting_receipt} shipment
                        {counts.awaiting_receipt === 1 ? "" : "s"} delivered and awaiting your
                        confirmation.
                    </Alert>
                ) : null}

                {shipments.length === 0 ? (
                    <div className="py-8 text-center bg-white rounded-2xl border border-slate-100">
                        <LocalShippingRoundedIcon sx={{ fontSize: 36, color: "#cbd5e1" }} />
                        <p className="text-[13px] font-bold text-gray-900 mt-1">
                            No {filters.direction} shipments
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                            Request a replenishment to get stock moving.
                        </p>
                    </div>
                ) : (
                    <Stack spacing={2}>
                        {shipments.map((shipment) => (
                            <ShipmentCard key={shipment.id}>
                                <ShipmentRouteHeader shipment={shipment} />
                                <LoadBar shipment={shipment} />

                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: "block", mt: 1 }}
                                >
                                    Scheduled {formatMoment(shipment.scheduled_for)}
                                    {shipment.courier ? ` · ${shipment.courier.name}` : ""}
                                </Typography>

                                <Stack direction="row" spacing={1} alignItems="center">
                                    <TransitionBar
                                        shipment={shipment}
                                        transitionRoute="seller.shipments.transition"
                                    />
                                    <Button
                                        component={Link}
                                        href={route("seller.shipments.show", shipment.id)}
                                        size="small"
                                        sx={{ mt: 1.5 }}
                                    >
                                        Details
                                    </Button>
                                </Stack>
                            </ShipmentCard>
                        ))}
                    </Stack>
                )}

                {pagination.last_page > 1 ? (
                    <Stack direction="row" spacing={2} justifyContent="center" alignItems="center">
                        <Button
                            disabled={pagination.current_page <= 1}
                            onClick={() =>
                                router.get(route("seller.shipments.index"), {
                                    ...filters,
                                    page: pagination.current_page - 1,
                                })
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
                                router.get(route("seller.shipments.index"), {
                                    ...filters,
                                    page: pagination.current_page + 1,
                                })
                            }
                        >
                            Next
                        </Button>
                    </Stack>
                ) : null}
            </div>

            <RequestDialog
                open={requestOpen}
                onClose={() => setRequestOpen(false)}
                stores={stores}
                ownStoreId={ownStoreId}
            />

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={flash?.error ? "error" : "success"} variant="filled">
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

/**
 * A seller may only pull stock *into* their own store, so the destination is
 * fixed server-side and only the origin is chosen here.
 */
function RequestDialog({
    open,
    onClose,
    stores,
    ownStoreId,
}: {
    open: boolean;
    onClose: () => void;
    stores: SellerShipmentIndexProps["stores"];
    ownStoreId: number;
}): React.ReactElement {
    const { data, setData, post, processing, errors, reset } = useForm({
        origin_store_id: "",
        // Always this seller's store; the server enforces it too.
        destination_store_id: String(ownStoreId),
        notes: "",
    });

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        post(route("seller.shipments.store"), {
            onSuccess: () => {
                reset();
                onClose();
            },
        });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <form onSubmit={submit}>
                <DialogTitle sx={{ fontWeight: 800 }}>Request replenishment</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <TextField
                            select
                            label="Source store"
                            value={data.origin_store_id}
                            onChange={(e) => setData("origin_store_id", e.target.value)}
                            error={Boolean(errors.origin_store_id)}
                            helperText={errors.origin_store_id ?? "Where the stock comes from."}
                        >
                            {stores.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {s.name}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            label="Notes"
                            multiline
                            rows={2}
                            value={data.notes}
                            onChange={(e) => setData("notes", e.target.value)}
                            error={Boolean(errors.notes)}
                            helperText={errors.notes}
                        />

                        {errors.destination_store_id ? (
                            <Alert severity="error">{errors.destination_store_id}</Alert>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={processing}>
                        Request
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

SellerShipments.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
