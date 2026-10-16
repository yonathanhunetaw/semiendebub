import React from "react";
import { Link, usePage } from "@inertiajs/react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { activeSectionTab, sectionTabHref, sectionTabVisible } from "./adminSections";
import { useAdminScope } from "./useAdminScope";

/**
 * The tab bar over a grouped screen (see adminSections.ts). Renders nothing on
 * screens outside a section, or when only one tab would show.
 */
export default function SectionTabs() {
    const { url } = usePage();
    const { isGlobalAdmin, roleKey, activeStore } = useAdminScope();
    const current = activeSectionTab(url.split("?")[0]);

    if (current === null) {
        return null;
    }

    const tabs = current.section.tabs.filter((tab) => sectionTabVisible(tab, isGlobalAdmin, roleKey, activeStore.id));

    if (tabs.length < 2) {
        return null;
    }

    // A tab can be current without being listed (a store page reached on
    // "All stores"); MUI wants a value that exists, so fall back to false.
    const value = tabs.some((tab) => tab.route === current.tab.route) ? current.tab.route : false;

    return (
        <Box sx={{ mb: 1.5 }}>
            {current.section.title === "store" && (
                <Typography sx={{ fontSize: "1.125rem", fontWeight: 800, mb: 0.25 }}>
                    {activeStore.id === "all" ? "All stores" : activeStore.name}
                </Typography>
            )}
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
