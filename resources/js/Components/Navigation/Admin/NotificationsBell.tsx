import React, { useState } from "react";
import { usePage } from "@inertiajs/react";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import ShelvesIcon from "@mui/icons-material/Shelves";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import AutorenewOutlined from "@mui/icons-material/AutorenewOutlined";
import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import { Badge, Box, ButtonBase, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { UserTask } from "@/types/tasks";

const ICONS: Record<string, React.ElementType> = {
    payment: PaymentsOutlined,
    cash: AccountBalanceWalletOutlined,
    handover: SwapHorizOutlined,
    warning: WarningAmberOutlined,
    parcel: Inventory2Outlined,
    shelf: ShelvesIcon,
    hub: WarehouseOutlined,
    refill: AutorenewOutlined,
    truck: LocalShippingOutlined,
};

/**
 * The top bar's bell: the user's to-do list. There is no push notification
 * system yet, so these are the live tasks the server shares on every visit
 * (`tasks`, App\Services\Tasks\TaskInbox): money to confirm, orders to pick
 * and pack, the shelf to refill, runs to collect. A task leaves the list
 * once it is done. Pass `tasks` to override the shared ones.
 */
export default function NotificationsBell({
    tasks: given,
    buttonSx,
}: {
    tasks?: UserTask[];
    /** For a coloured header (the seller app). */
    buttonSx?: SxProps<Theme>;
}) {
    const shared = (usePage().props as { tasks?: UserTask[] }).tasks;
    const tasks = given ?? shared ?? [];
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const total = tasks.reduce((sum, task) => sum + task.count, 0);
    const urgent = tasks.some((task) => task.urgent);

    return (
        <>
            <Tooltip title={total > 0 ? `${total} thing(s) to do` : "Notifications"}>
                <IconButton onClick={(event) => setAnchor(event.currentTarget)} aria-label="Notifications" size="small" sx={buttonSx}>
                    <Badge color={urgent ? "error" : "primary"} badgeContent={total} max={99} invisible={total === 0}>
                        {total > 0 ? <NotificationsActiveOutlined /> : <NotificationsNoneOutlined />}
                    </Badge>
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { width: 340, maxWidth: "calc(100vw - 32px)", mt: 1, borderRadius: 2 } } }}
            >
                <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>To do</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Tasks waiting on you right now
                    </Typography>
                </Box>
                {tasks.length === 0 ? (
                    <Box sx={{ px: 2, py: 4, textAlign: "center" }}>
                        <NotificationsNoneOutlined sx={{ color: "text.disabled", fontSize: 36 }} />
                        <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mt: 1 }}>Nothing waiting on you</Typography>
                    </Box>
                ) : (
                    tasks.map((task) => {
                        const Icon = ICONS[task.kind] ?? NotificationsNoneOutlined;

                        return (
                            <ButtonBase
                                key={task.id}
                                component="a"
                                href={task.href ?? undefined}
                                onClick={() => setAnchor(null)}
                                sx={{
                                    display: "flex",
                                    width: "100%",
                                    alignItems: "flex-start",
                                    textAlign: "left",
                                    gap: 1.5,
                                    px: 2,
                                    py: 1.25,
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    "&:hover": { bgcolor: "action.hover" },
                                }}
                            >
                                <Box
                                    sx={{
                                        mt: 0.25,
                                        width: 32,
                                        height: 32,
                                        borderRadius: "50%",
                                        flexShrink: 0,
                                        display: "grid",
                                        placeItems: "center",
                                        bgcolor: task.urgent ? "error.main" : "primary.main",
                                        color: task.urgent ? "error.contrastText" : "primary.contrastText",
                                    }}
                                >
                                    <Icon sx={{ fontSize: 18 }} />
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                                        {task.title} · {task.count}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                        {task.detail}
                                    </Typography>
                                </Box>
                                {task.href ? <ChevronRight sx={{ color: "text.disabled", mt: 0.5 }} /> : null}
                            </ButtonBase>
                        );
                    })
                )}
            </Popover>
        </>
    );
}
