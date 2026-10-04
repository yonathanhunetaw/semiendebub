import { EmptyState, PageHeader, SkCard } from "@/Components/StockKeeper/stockKeeperUi";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import type { RefillRow, ShelvingBoard, ShelvingNeed } from "@/types/refills";
import { Head, Link, router } from "@inertiajs/react";
import ShelvesIcon from "@mui/icons-material/ViewModuleRounded";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import React, { useState } from "react";

interface Props {
    storeId?: number | null;
    board?: ShelvingBoard | null;
}

const NEED_CHIP: Record<ShelvingNeed["status"], { label: string; color: "default" | "warning" | "error" }> = {
    empty: { label: "Empty", color: "default" },
    refill: { label: "Refill", color: "warning" },
    critical: { label: "Crit low", color: "error" },
};

const sectionTitleSx = { fontWeight: 800, mb: 1.5 } as const;

const when = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not scheduled yet";

/** What became of a request, in the stock keeper's words. */
function fate(row: RefillRow): { text: string; color: "default" | "warning" | "info" | "success" | "error" } {
    const to = row.destination === "remote_hub" ? " to the Remote Hub" : "";

    switch (row.stage) {
        case "waiting":
            return { text: "Waiting for the manager", color: "warning" };
        case "remote_list":
            return { text: `Added to the Remote Hub list${row.added_by ? ` by ${row.added_by}` : ""} · waiting for the hub to send it`, color: "info" };
        case "remote_on_way":
            return { text: `Coming from the Remote Hub${row.transfer ? ` · ${row.transfer.reference}` : ""}`, color: "info" };
        case "on_manifest":
            return {
                text: `Added to manifest ${row.shipment?.reference ?? ""}${to} · scheduled for ${when(row.shipment?.scheduled_for ?? null)}`,
                color: "success",
            };
        case "landed":
            return { text: "Arrived", color: "default" };
        case "cancelled":
            return { text: `Cancelled${row.cancelled_by ? ` by ${row.cancelled_by}` : ""}${row.cancel_reason ? `: ${row.cancel_reason}` : ""}`, color: "error" };
    }
}
const rowSx = { py: 1.25, borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } } as const;

/**
 * The shelving list: floor → shelf transfers to carry across (no courier, no
 * approval), approved Remote Hub refills to accept, and bins at their refill
 * line with nothing on its way yet.
 */
export default function Shelving({ storeId = null, board = null }: Props): React.ReactElement {
    const [busy, setBusy] = useState<string | null>(null);

    const post = (key: string, url: string, data: Record<string, string> = {}): void => {
        setBusy(key);
        router.post(url, data, { preserveScroll: true, onFinish: () => setBusy(null) });
    };

    if (storeId === null || board === null || board.shelf === null) {
        return (
            <>
                <Head title="Shelving" />
                <PageHeader title="Shelving" subtitle="Floor → shelf refills for your store" />
                <SkCard>
                    <EmptyState
                        icon={<ShelvesIcon fontSize="large" />}
                        title="No store shelf to work on"
                        hint="You need to be assigned to a store with a Store Shelf to see its shelving list."
                    />
                </SkCard>
            </>
        );
    }

    const shelfId = board.shelf.id;

    return (
        <>
            <Head title="Shelving" />
            <PageHeader
                title="Shelving"
                subtitle={`${board.shelf.name} · carry stock across from the store floor`}
                action={
                    <Button component={Link} href={route("stock_keeper.shelving.permissions")} variant="text">
                        Who can do what
                    </Button>
                }
            />

            <Stack spacing={2.5}>
                <SkCard>
                    <Typography variant="h6" sx={sectionTitleSx}>
                        To shelve ({board.to_shelve.length})
                    </Typography>
                    {board.to_shelve.length === 0 ? (
                        <EmptyState title="Nothing to shelve" hint="Refills from the store floor land here." />
                    ) : (
                        board.to_shelve.map((task) => (
                            <Stack key={task.transfer_id} direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={rowSx}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="body1" sx={{ fontWeight: 700 }} noWrap>
                                            {task.item_name}
                                        </Typography>
                                        {task.urgent ? <Chip size="small" color="error" label="Crit low" /> : null}
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        {task.display} · {task.reference}
                                        {task.refill_reference ? ` · ${task.refill_reference}` : ""}
                                    </Typography>
                                </Box>
                                {board.can_shelve ? (
                                    <Button
                                        variant="contained"
                                        disabled={busy !== null}
                                        onClick={() => post(`shelve-${task.transfer_id}`, route("stock_keeper.shelving.shelve", task.transfer_id))}
                                    >
                                        Shelved
                                    </Button>
                                ) : null}
                            </Stack>
                        ))
                    )}
                </SkCard>

                {board.remote_hub ? (
                    <SkCard>
                        <Typography variant="h6" sx={sectionTitleSx}>
                            {board.remote_hub.name}: to send ({board.to_accept.length})
                        </Typography>
                        {board.to_accept.length === 0 ? (
                            <EmptyState title="Nothing approved to send" hint="Refills the store manager approves from the Remote Hub appear here." />
                        ) : (
                            board.to_accept.map((row) => (
                                <Stack key={row.id} direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={rowSx}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body1" sx={{ fontWeight: 700 }} noWrap>
                                                {row.item_name}
                                            </Typography>
                                            {row.urgent ? <Chip size="small" color="error" label="Crit low" /> : null}
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary">
                                            {row.display} to the store floor · {row.reference}
                                        </Typography>
                                    </Box>
                                    {row.can.accept ? (
                                        <Button
                                            variant="contained"
                                            disabled={busy !== null}
                                            onClick={() => post(`accept-${row.id}`, route("stock_keeper.refills.accept", row.id))}
                                        >
                                            Accept
                                        </Button>
                                    ) : null}
                                </Stack>
                            ))
                        )}
                    </SkCard>
                ) : null}

                <SkCard>
                    <Typography variant="h6" sx={sectionTitleSx}>
                        My requests ({board.my_requests.length})
                    </Typography>
                    {board.my_requests.length === 0 ? (
                        <EmptyState title="No requests yet" hint="What the store floor cannot cover goes to the store manager; you will see here what they decide." />
                    ) : (
                        board.my_requests.map((row) => {
                            const status = fate(row);

                            return (
                                <Box key={row.id} sx={rowSx}>
                                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                            <Typography variant="body1" sx={{ fontWeight: 700 }} noWrap>
                                                {row.item_name}
                                            </Typography>
                                            {row.urgent && row.stage === "waiting" ? <Chip size="small" color="error" label="Crit low" /> : null}
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                            {row.origin === "manual" ? (row.raised_by ?? "Stock keeper") : "Auto"} · {row.reference}
                                        </Typography>
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        {row.adjusted
                                            ? `You asked for ${row.requested_display}; ${row.display} ${row.stage === "waiting" ? "set by the manager" : "were sent"}`
                                            : row.display}
                                        {row.target ? ` for ${row.target.name}` : ""}
                                    </Typography>
                                    <Chip size="small" variant="outlined" color={status.color} label={status.text} sx={{ mt: 0.75, maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.25 } }} />
                                </Box>
                            );
                        })
                    )}
                </SkCard>

                <SkCard>
                    <Typography variant="h6" sx={sectionTitleSx}>
                        Needs a refill ({board.needs.length})
                    </Typography>
                    {board.needs.length === 0 ? (
                        <EmptyState title="Every bin is covered" hint="Bins at their refill line with nothing on its way show here." />
                    ) : (
                        board.needs.map((need) => (
                            <Stack
                                key={need.item_id}
                                direction={{ xs: "column", sm: "row" }}
                                alignItems={{ xs: "flex-start", sm: "center" }}
                                justifyContent="space-between"
                                spacing={1.5}
                                sx={rowSx}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="body1" sx={{ fontWeight: 700 }} noWrap>
                                            {need.name}
                                        </Typography>
                                        <Chip size="small" color={NEED_CHIP[need.status].color} label={NEED_CHIP[need.status].label} />
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        {need.display || "Nothing"} on the shelf
                                        {need.band ? ` · refill at ${need.band.refill}, max ${need.band.max} ${need.unit.toLowerCase()}` : ""}
                                    </Typography>
                                </Box>
                                {board.can_raise ? (
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            variant="outlined"
                                            disabled={busy !== null}
                                            onClick={() => post(`raise-${need.item_id}`, route("stock_keeper.shelves.refill", { location: shelfId, item: need.item_id }))}
                                        >
                                            Raise refill
                                        </Button>
                                        <Button
                                            variant="text"
                                            disabled={busy !== null}
                                            title="The floor's count is wrong: skip it and ask the Remote Hub, or a shipment"
                                            onClick={() =>
                                                post(`skip-${need.item_id}`, route("stock_keeper.shelves.refill", { location: shelfId, item: need.item_id }), {
                                                    start_at: board.remote_hub ? "remote_hub" : "shipment",
                                                })
                                            }
                                        >
                                            Floor is empty
                                        </Button>
                                    </Stack>
                                ) : null}
                            </Stack>
                        ))
                    )}
                </SkCard>
            </Stack>
        </>
    );
}

Shelving.layout = (page: React.ReactNode) => <StockKeeperLayout>{page}</StockKeeperLayout>;
