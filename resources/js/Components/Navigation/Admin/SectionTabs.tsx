import React from "react";
import { Link, usePage } from "@inertiajs/react";
import { Box, Chip, Tab, Tabs, Typography } from "@mui/material";
import useHideChromeOnScroll from "@/hooks/useHideChromeOnScroll";
import { activeSectionTab, sectionTabHref, sectionTabVisible, visibleGroups } from "./adminSections";
import { useAdminScope } from "./useAdminScope";

/** Slides the sticky tabs and the top bar away while scrolling down (see app.css). */
function HideOnScroll({ resetKey }: { resetKey: string }): null {
    useHideChromeOnScroll(resetKey, "admin-chrome-hidden");

    return null;
}

/**
 * The tab bar over a grouped screen (see adminSections.ts). Renders nothing on
 * screens outside a section, or when only one tab would show. A section with
 * `groups` (Store) shows two levels: the groups, then the current group's
 * screens, in one compact sticky block under the top bar.
 */
export default function SectionTabs() {
    const { url } = usePage();
    const { isGlobalAdmin, roleKey, activeStore } = useAdminScope();
    const path = url.split("?")[0];
    const current = activeSectionTab(path);

    if (current === null) {
        return null;
    }

    const tabs = current.section.tabs.filter((tab) => sectionTabVisible(tab, isGlobalAdmin, roleKey, activeStore.id));

    if (tabs.length < 2) {
        return null;
    }

    const title =
        current.section.title === "store" ? (
            <Typography noWrap sx={{ fontSize: "1.125rem", fontWeight: 800, mb: 0.25 }}>
                {activeStore.id === "all" ? "All stores" : activeStore.name}
            </Typography>
        ) : null;

    const groups = visibleGroups(current.section, tabs);

    if (groups.length > 0) {
        const groupKey = groups.some((group) => group.key === current.tab.group) ? current.tab.group : false;
        const inGroup = tabs.filter((tab) => tab.group === groupKey);

        return (
            <Box
                className="admin-section-tabs"
                sx={(theme) => ({
                    position: "sticky",
                    top: { xs: 52, md: 64 },
                    zIndex: theme.zIndex.appBar - 1,
                    bgcolor: "background.default",
                    mx: { xs: -1, sm: -2 },
                    px: { xs: 1, sm: 2 },
                    pt: 0.5,
                    pb: 1,
                    mb: 1,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                })}
            >
                <HideOnScroll resetKey={path} />
                {title}
                {/* Level 1: what you are managing. */}
                <Tabs value={groupKey} variant="fullWidth" sx={{ minHeight: 38 }}>
                    {groups.map((group) => {
                        const first = tabs.find((tab) => tab.group === group.key);

                        return (
                            <Tab
                                key={group.key}
                                value={group.key}
                                label={group.label}
                                component={Link}
                                href={first ? sectionTabHref(first, activeStore.id) : "#"}
                                sx={{ fontWeight: 800, fontSize: "0.8125rem", minHeight: 38, minWidth: 0, py: 0.5, px: 1 }}
                            />
                        );
                    })}
                </Tabs>
                {/* Level 2: the screens in that group. */}
                {inGroup.length > 1 && (
                    <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pt: 1, "&::-webkit-scrollbar": { display: "none" } }}>
                        {inGroup.map((tab) => {
                            const on = tab.route === current.tab.route;

                            return (
                                <Chip
                                    key={tab.route}
                                    label={tab.label}
                                    size="small"
                                    color={on ? "primary" : "default"}
                                    variant={on ? "filled" : "outlined"}
                                    component={Link}
                                    href={sectionTabHref(tab, activeStore.id)}
                                    clickable
                                    sx={{ fontWeight: 700 }}
                                />
                            );
                        })}
                    </Box>
                )}
            </Box>
        );
    }

    // A tab can be current without being listed (a store page reached on
    // "All stores"); MUI wants a value that exists, so fall back to false.
    const value = tabs.some((tab) => tab.route === current.tab.route) ? current.tab.route : false;

    return (
        <Box sx={{ mb: 1.5 }}>
            {title}
            <Box sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
                <Tabs value={value} sx={{ minHeight: 36 }} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
                    {tabs.map((tab) => (
                        <Tab
                            key={tab.route}
                            value={tab.route}
                            label={tab.label}
                            component={Link}
                            href={sectionTabHref(tab, activeStore.id)}
                            sx={{ fontWeight: 700, fontSize: "0.75rem", minHeight: 36, py: 0.5, px: 1.5 }}
                        />
                    ))}
                </Tabs>
            </Box>
        </Box>
    );
}
