import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import CloseRounded from "@mui/icons-material/CloseRounded";
import Hub from "@mui/icons-material/Hub";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import OpenInNew from "@mui/icons-material/OpenInNew";
import { Link, usePage } from "@inertiajs/react";
import {
    Box,
    Chip,
    Collapse,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    Toolbar,
} from "@mui/material";
import {
    ADMIN_NAV,
    navItemActive,
    navItemHref,
    navItemVisible,
    type AdminNavItem,
} from "./adminNavConfig";
import { useAdminScope } from "./useAdminScope";

export const ADMIN_SIDEBAR_WIDTH = 256;

const itemSx = {
    borderRadius: 2,
    mx: 1.5,
    mb: 0.25,
    py: 0.75,
    color: "text.secondary",
    "& .MuiListItemIcon-root": { minWidth: 36, color: "inherit" },
    "& .MuiListItemText-primary": { fontSize: "0.875rem", fontWeight: 500 },
    position: "relative",
    "&.Mui-selected, &.Mui-selected:hover": {
        bgcolor: "primary.main",
        color: "primary.contrastText",
        boxShadow: 2,
        "& .MuiListItemText-primary": { fontWeight: 800 },
        // A bar at the sidebar's edge, so the current entry reads at a glance.
        "&::before": {
            content: '""',
            position: "absolute",
            left: -12,
            top: 6,
            bottom: 6,
            width: 4,
            borderRadius: 2,
            bgcolor: "primary.main",
        },
    },
} as const;

/** Where the sidebar list was scrolled, so a page change does not jump it to the top. */
const SCROLL_KEY = "admin.sidebar.scroll";

function readScroll(): number {
    try {
        return Number(window.sessionStorage.getItem(SCROLL_KEY) ?? 0) || 0;
    } catch {
        return 0;
    }
}

function writeScroll(top: number): void {
    try {
        window.sessionStorage.setItem(SCROLL_KEY, String(Math.round(top)));
    } catch {
        // Storage blocked (private window): the selected entry is still scrolled into view.
    }
}

const childSx = {
    ...itemSx,
    ml: 4.5,
    py: 0.5,
    "& .MuiListItemIcon-root": { minWidth: 30, color: "inherit" },
    "& .MuiListItemText-primary": { fontSize: "0.8125rem", fontWeight: 500 },
} as const;

const zoneHeaderSx = {
    bgcolor: "transparent",
    color: "text.secondary",
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    lineHeight: "32px",
    px: 3,
} as const;

/**
 * The admin sidebar: store dropdown -> store zone -> global zone (global
 * admins only). Driven by adminNavConfig.ts; see that file for the zones. Settings
 * and the light/dark switch live in the account menu of the top bar.
 */
export default function AdminSidebar({
    open,
    onClose,
    variant,
    sx,
}: {
    open: boolean;
    onClose: () => void;
    variant: "temporary" | "permanent";
    sx?: Record<string, unknown>;
}) {
    const { url } = usePage();
    const path = url.split("?")[0];
    const { isGlobalAdmin, roleKey, counts, activeStore } = useAdminScope();
    const listRef = useRef<HTMLDivElement | null>(null);

    // Admin pages use two layouts, so moving between them rebuilds the
    // sidebar. Put the list back where it was before the first paint...
    useLayoutEffect(() => {
        if (listRef.current) listRef.current.scrollTop = readScroll();
    }, []);

    // ...and make sure the page just opened is visible in it.
    useEffect(() => {
        const selected = listRef.current?.querySelector<HTMLElement>(".Mui-selected");
        selected?.scrollIntoView({ block: "nearest" });
    }, [path, activeStore.id]);

    const visible = (item: AdminNavItem) => navItemVisible(item, roleKey, isGlobalAdmin, activeStore.id);
    const storeZone = ADMIN_NAV.filter((item) => item.scope === "store" && visible(item));
    const globalZone = ADMIN_NAV.filter((item) => item.scope === "global" && visible(item));

    // Groups start open when one of their children is the current page.
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(
            ADMIN_NAV.filter((item) => item.children).map((item) => [
                item.key,
                (item.children ?? []).some((child) => navItemActive(child, path)),
            ]),
        ),
    );

    const closeIfTemporary = variant === "temporary" ? onClose : undefined;

    const renderItem = (item: AdminNavItem, child = false): React.ReactNode => {
        const Icon = item.icon;
        const selected = navItemActive(item, path, activeStore.id);
        const badge = item.badge && counts ? counts[item.badge] : 0;
        const linkProps = item.external
            ? { component: "a" as const, href: navItemHref(item, activeStore.id, roleKey), ...(item.newTab ? { target: "_blank", rel: "noopener" } : {}) }
            : { component: Link, href: navItemHref(item, activeStore.id, roleKey) };

        return (
            <ListItemButton key={item.key} {...linkProps} selected={selected} sx={child ? childSx : itemSx} onClick={closeIfTemporary}>
                <ListItemIcon>
                    <Icon fontSize={child ? "small" : "medium"} />
                </ListItemIcon>
                <ListItemText primary={item.label} secondary={item.storeSection && roleKey === "admin" ? activeStore.name : undefined} secondaryTypographyProps={{ noWrap: true, sx: { color: "inherit", opacity: 0.75, fontSize: "0.75rem" } }} />
                {badge > 0 && (
                    <Chip
                        label={badge > 999 ? "999+" : badge}
                        size="small"
                        color={selected ? "default" : "primary"}
                        variant={selected ? "filled" : "outlined"}
                        sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 700, ...(selected ? { bgcolor: "background.paper" } : {}) }}
                    />
                )}
                {item.external && item.newTab && <OpenInNew sx={{ fontSize: 14, opacity: 0.6 }} />}
            </ListItemButton>
        );
    };

    const renderGroup = (item: AdminNavItem): React.ReactNode => {
        const children = (item.children ?? []).filter(visible);

        if (children.length === 0) {
            return null;
        }

        const Icon = item.icon;
        const isOpen = openGroups[item.key] ?? false;
        const active = children.some((child) => navItemActive(child, path));

        return (
            <React.Fragment key={item.key}>
                <ListItemButton
                    sx={{ ...itemSx, ...(active ? { color: "primary.main" } : {}) }}
                    onClick={() => setOpenGroups((groups) => ({ ...groups, [item.key]: !isOpen }))}
                    aria-expanded={isOpen}
                >
                    <ListItemIcon>
                        <Icon />
                    </ListItemIcon>
                    <ListItemText primary={item.label} />
                    {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        {children.map((child) => renderItem(child, true))}
                    </List>
                </Collapse>
            </React.Fragment>
        );
    };

    const content = (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Box ref={listRef} onScroll={(event) => writeScroll(event.currentTarget.scrollTop)} sx={{ flexGrow: 1, overflowY: "auto", pb: 2 }}>
                <List dense disablePadding subheader={<ListSubheader disableSticky sx={zoneHeaderSx}>Store operations</ListSubheader>}>
                    {storeZone.map((item) => (item.children ? renderGroup(item) : renderItem(item)))}
                </List>

                {globalZone.length > 0 && (
                    <>
                        <Divider sx={{ my: 1.5, mx: 2 }} />
                        <List dense disablePadding subheader={<ListSubheader disableSticky sx={zoneHeaderSx}>Global zone (HQ only)</ListSubheader>}>
                            {globalZone.map((item) => renderItem(item))}
                        </List>
                    </>
                )}
            </Box>

        </Box>
    );

    return (
        <Drawer
            variant={variant}
            open={open}
            onClose={onClose}
            ModalProps={{ keepMounted: true }}
            sx={{
                width: ADMIN_SIDEBAR_WIDTH,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                    width: ADMIN_SIDEBAR_WIDTH,
                    // Never the whole of a narrow phone: leave a strip to tap away.
                    maxWidth: "85vw",
                    boxSizing: "border-box",
                    bgcolor: "background.paper",
                    color: "text.primary",
                    borderRight: "1px solid",
                    borderColor: "divider",
                    "& *::-webkit-scrollbar": { width: "8px" },
                    "& *::-webkit-scrollbar-track": { background: "transparent" },
                    "& *::-webkit-scrollbar-thumb": { background: "rgb(var(--outline))", borderRadius: "4px" },
                },
                ...sx,
            }}
        >
            {/* The top bar spans the full width; this keeps the list below it. */}
            {variant === "permanent" && <Toolbar sx={{ minHeight: { xs: 64 } }} />}
            {/* The drawer covers the top bar on a phone or tablet, so it carries its own header. */}
            {variant === "temporary" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2, minHeight: 64, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Box sx={{ width: 32, height: 32, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center" }}>
                        <Hub fontSize="small" />
                    </Box>
                    <Box component="span" sx={{ fontWeight: 800, fontSize: "1rem", flexGrow: 1 }}>Mezgebe Dirijit</Box>
                    <IconButton onClick={onClose} aria-label="Close navigation" edge="end">
                        <CloseRounded />
                    </IconButton>
                </Box>
            )}
            {content}
        </Drawer>
    );
}
