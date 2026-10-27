import React, { useEffect, useState } from "react";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import { Box, Button, ButtonBase, Divider, Fab, IconButton, List, ListItemButton, ListItemText, Popover, Tooltip, Typography } from "@mui/material";
import { router, usePage } from "@inertiajs/react";
import AppIcon from "@/Components/Visual/AppIcon";
import NineDots from "@/Components/Visual/NineDots";
import { ROLES, getRole, roleUrl, type RoleKey } from "@/theme";

interface OpenableUser {
    id: number;
    name: string;
    role_key: string;
}

interface Openable {
    /** The admin's own name, for the "Me" row. */
    me: string;
    /** The apps this admin may open as themself (role keys). */
    mine: string[];
    /** Other people a global admin may open (empty for a store admin). */
    people: OpenableUser[];
}

interface AppsMenuProps {
    roleKey: string;
    /** The app being shown now. */
    current: RoleKey;
    /** Whether the signed-in account is the admin themself (not someone opened as). */
    meHere?: boolean;
    variant?: "pill" | "fab";
    /** Who is behind this account, shown under the name: "You" or "Opened by <admin>". */
    header?: React.ReactNode;
    /** The signed-in person's name, for "who am I now". */
    accountName?: string;
    /** Shown below the apps; gets a function that closes the window. */
    footer?: (close: () => void) => React.ReactNode;
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * The Apps menu, for admins (a global admin and a store admin).
 *
 * A small window: first the apps, alphabetical, as a grid; choosing one lists
 * who you can be in it, again alphabetical, with "Me" first. Each choice hands
 * the account over to that app without a second login (ImpersonationController).
 * The server decides what is on offer, so a store admin sees only the apps they
 * are ticked for and only themself in each, while a global admin also sees
 * other people. Someone else who works in the seller app (a store manager)
 * keeps a plain link there.
 *
 * `variant="fab"` is the round button shown inside an app an admin has switched
 * into: it floats above the bottom nav and wears the current app's
 * character in a ring.
 */
/**
 * The menu for use inside a page (it reads the signed-in person from the page).
 * The round button's banner lives outside the page tree, where `usePage` is not
 * available, so it uses AppsMenu and passes the name in.
 */
export default function RoleSwitcher(props: Omit<AppsMenuProps, "accountName">) {
    const account = (usePage().props as { auth?: { user?: { first_name?: string; last_name?: string | null } } }).auth?.user;

    return <AppsMenu {...props} accountName={`${account?.first_name ?? ""} ${account?.last_name ?? ""}`.trim()} />;
}

export function AppsMenu({ roleKey, current, meHere = true, variant = "pill", header = "You", accountName = "", footer }: AppsMenuProps) {
    const fab = variant === "fab";
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [openable, setOpenable] = useState<Openable | null>(null);
    const [app, setApp] = useState<RoleKey | null>(null);
    const isAdmin = roleKey === "admin";
    const open = Boolean(anchor);

    // Fetched when the window opens, so it reflects the user's current roles.
    useEffect(() => {
        if (!open || !isAdmin) return;
        window
            .fetch("/impersonate/users", { headers: { Accept: "application/json" }, credentials: "same-origin" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => setOpenable(data ? { me: data.me ?? "", mine: data.mine ?? [], people: data.people ?? [] } : null))
            .catch(() => setOpenable(null));
    }, [open, isAdmin]);

    const close = () => {
        setAnchor(null);
        setApp(null);
    };

    const go = (body: { role: string } | { user_id: number }) => {
        close();
        router.post("/impersonate", body);
    };

    // A store manager's one way across: a plain link to the seller app.
    if (!isAdmin) {
        return roleKey === "store_manager" && current !== "seller" ? (
            <Button size="small" variant="outlined" href={roleUrl("seller", "/dashboard")} sx={{ borderRadius: 999, fontWeight: 700, whiteSpace: "nowrap" }}>
                Seller app
            </Button>
        ) : null;
    }

    const apps = ROLES.filter((role) => openable?.mine.includes(role.key)).sort(byLabel);
    const peopleOf = (key: RoleKey) => (openable?.people ?? []).filter((user) => user.role_key === key).sort((a, b) => a.name.localeCompare(b.name));
    // Being yourself in the app you are already in, as yourself, is nothing to do.
    const meDisabled = (key: RoleKey) => key === current && meHere;
    const chosen = app ? ROLES.find((role) => role.key === app) : null;

    const pick = (key: RoleKey) => {
        if (peopleOf(key).length === 0) {
            if (!meDisabled(key)) go({ role: key });
            return;
        }
        setApp(key);
    };

    return (
        <>
            {fab ? (
                <Tooltip title="Apps" placement="left">
                    {/* `dock-float` rides above the nav and follows it down (app.css). */}
                    <Fab
                        size="small"
                        onClick={(event) => setAnchor(event.currentTarget)}
                        aria-haspopup="true"
                        aria-expanded={open ? "true" : undefined}
                        aria-label="Apps"
                        className="dock-float role-fab"
                        sx={{
                            position: "fixed",
                            right: 16,
                            zIndex: (theme) => theme.zIndex.appBar - 1,
                            bgcolor: "background.paper",
                            border: "2px solid",
                            borderColor: "warning.main",
                            boxShadow: 4,
                            "--dock-gap": "14px",
                            "&:hover": { bgcolor: "background.paper" },
                        }}
                    >
                        <NineDots size={22} />
                    </Fab>
                </Tooltip>
            ) : (
                /* The pill wears the current app's character, with room between it and the words. */
                <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    onClick={(event) => setAnchor(event.currentTarget)}
                    aria-haspopup="true"
                    aria-expanded={open ? "true" : undefined}
                    aria-label="Apps"
                    sx={{ borderRadius: 999, fontWeight: 700, pl: 0.5, pr: { xs: 1.5, md: 1, lg: 1.5 }, py: 0.5, minWidth: 0, gap: 1, whiteSpace: "nowrap" }}
                >
                    <AppIcon role={current} size={28} />
                    {/* Words hidden between phone and desktop, where the bar is tight. */}
                    <Box component="span" sx={{ display: { xs: "inline", md: "none", lg: "inline" } }}>
                        Apps
                    </Box>
                    <NineDots size={18} />
                </Button>
            )}
            <Popover
                anchorEl={anchor}
                open={open}
                onClose={close}
                anchorOrigin={fab ? { vertical: "top", horizontal: "right" } : { vertical: "bottom", horizontal: "left" }}
                transformOrigin={fab ? { vertical: "bottom", horizontal: "right" } : { vertical: "top", horizontal: "left" }}
                slotProps={{ paper: { sx: { width: 292, maxWidth: "calc(100vw - 24px)", maxHeight: "70vh", mt: fab ? 0 : 0.75, mb: fab ? 0.75 : 0, borderRadius: 3, p: 1 } } }}
            >
                {/* Who this is right now, and in which app. */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 0.5, pb: 1 }}>
                    <AppIcon role={current} size={36} />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 800, fontSize: "0.875rem", lineHeight: 1.2 }}>
                            {accountName || "Signed in"}
                        </Typography>
                        <Typography noWrap variant="caption" color="text.secondary">
                            {getRole(current).label} app · {header}
                        </Typography>
                    </Box>
                </Box>
                <Divider sx={{ mb: 0.75 }} />

                {chosen ? (
                    <>
                        {/* Step two: who to be in this app, alphabetical, "Me" first. */}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pb: 0.5 }}>
                            <IconButton size="small" onClick={() => setApp(null)} aria-label="Back to apps">
                                <ArrowBackRounded fontSize="small" />
                            </IconButton>
                            <AppIcon role={chosen.key} size={28} />
                            <Typography sx={{ fontWeight: 800, fontSize: "0.9rem" }}>{chosen.label}</Typography>
                        </Box>
                        <List dense disablePadding>
                            <ListItemButton disabled={meDisabled(chosen.key)} onClick={() => go({ role: chosen.key })} sx={{ borderRadius: 2 }}>
                                <ListItemText
                                    primary={openable?.me ? `Me · ${openable.me}` : "Me"}
                                    secondary={meDisabled(chosen.key) ? "You are here" : undefined}
                                    slotProps={{ primary: { sx: { fontWeight: 700 } } }}
                                />
                            </ListItemButton>
                            {peopleOf(chosen.key).map((user) => (
                                <ListItemButton key={user.id} onClick={() => go({ user_id: user.id })} sx={{ borderRadius: 2 }}>
                                    <ListItemText primary={user.name} />
                                </ListItemButton>
                            ))}
                        </List>
                    </>
                ) : (
                    /* Step one: only the apps. */
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.5 }}>
                        {openable === null && (
                            <Typography variant="body2" sx={{ gridColumn: "1 / -1", p: 1, color: "text.secondary" }}>
                                Loading...
                            </Typography>
                        )}
                        {apps.map((role) => {
                            const here = role.key === current;
                            const idle = peopleOf(role.key).length === 0 && meDisabled(role.key);

                            return (
                                <ButtonBase
                                    key={role.key}
                                    onClick={() => pick(role.key)}
                                    disabled={idle}
                                    aria-label={role.label}
                                    aria-current={here ? "true" : undefined}
                                    sx={{ flexDirection: "column", gap: 0.5, py: 1, px: 0.5, borderRadius: 2, bgcolor: here ? "action.selected" : "transparent", "&:hover": { bgcolor: "action.hover" }, "&.Mui-disabled": { opacity: 1 } }}
                                >
                                    <AppIcon role={role.key} size={40} />
                                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.2, textAlign: "center", wordBreak: "break-word" }}>{role.label}</Typography>
                                </ButtonBase>
                            );
                        })}
                    </Box>
                )}

                {footer && !chosen && <Divider sx={{ my: 0.75 }} />}
                {!chosen && footer?.(close)}
            </Popover>
        </>
    );
}
