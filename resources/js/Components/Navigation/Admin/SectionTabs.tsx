import React from "react";
import { Link, usePage } from "@inertiajs/react";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import { Box, Button, Tab, Tabs, Typography } from "@mui/material";
import { activeSectionTab, sectionTabHref, sectionTabVisible } from "./adminSections";
import { useAdminScope } from "./useAdminScope";

/**
 * The tab bar over a grouped screen (see adminSections.ts). Renders nothing on
 * screens outside a section, or when only one tab would show. A section with
 * `groups` (Store) is a hub instead: its screens show a back link to it.
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

    // The Store section is a hub (Pages/Admin/Stores/Hub) with screens under it:
    // on a screen, a quiet back link replaces the two rows of tabs.
    if (current.section.groups) {
        const allStores = activeStore.id === "all";

        if (allStores && current.tab.route === "inventory.index") {
            return null;
        }

        const group = current.section.groups.find((entry) => entry.key === current.tab.group);

        return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, minWidth: 0 }}>
                <Button
                    component={Link}
                    href={allStores ? route("inventory.index") : route("store.hub", activeStore.id)}
                    size="small"
                    startIcon={<ArrowBackRounded />}
                    sx={{ borderRadius: 999, fontWeight: 700, flexShrink: 0 }}
                >
                    {allStores ? "All stores" : activeStore.name}
                </Button>
                <Typography noWrap variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    {group ? `${group.label} · ` : ""}
                    {current.tab.label}
                </Typography>
            </Box>
        );
    }

    // A tab can be current without being listed (a store page reached on
    // "All stores"); MUI wants a value that exists, so fall back to false.
    const value = tabs.some((tab) => tab.route === current.tab.route) ? current.tab.route : false;

    return (
        <Box sx={{ mb: 1.5 }}>
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
