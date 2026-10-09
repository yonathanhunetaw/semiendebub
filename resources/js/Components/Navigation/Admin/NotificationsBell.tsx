import React, { useState } from "react";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import { Badge, Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";

export interface AdminNotification {
    id: string | number;
    title: string;
    detail?: string;
    at?: string;
}

/**
 * The top bar's bell. There is no notification system yet, so it opens an
 * empty state and shows no unread dot. Pass `notifications` (and an unread
 * count) once one exists; nothing else here needs to change.
 */
export default function NotificationsBell({
    notifications = [],
    unread = 0,
}: {
    notifications?: AdminNotification[];
    unread?: number;
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    return (
        <>
            <Tooltip title="Notifications">
                <IconButton onClick={(event) => setAnchor(event.currentTarget)} aria-label="Notifications" size="small">
                    <Badge color="error" variant="dot" invisible={unread === 0}>
                        <NotificationsNoneOutlined />
                    </Badge>
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { width: 320, maxWidth: "calc(100vw - 32px)", mt: 1, borderRadius: 2 } } }}
            >
                <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>Notifications</Typography>
                </Box>
                {notifications.length === 0 ? (
                    <Box sx={{ px: 2, py: 4, textAlign: "center" }}>
                        <NotificationsNoneOutlined sx={{ color: "text.disabled", fontSize: 36 }} />
                        <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", mt: 1 }}>No notifications yet</Typography>
                    </Box>
                ) : (
                    notifications.map((notification) => (
                        <Box key={notification.id} sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
                            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{notification.title}</Typography>
                            {notification.detail && (
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                    {notification.detail}
                                </Typography>
                            )}
                        </Box>
                    ))
                )}
            </Popover>
        </>
    );
}
