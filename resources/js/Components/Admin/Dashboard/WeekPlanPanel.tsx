import { Box } from "@mui/material";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import React from "react";
import WeekPlan from "@/Components/Work/WeekPlan";
import { PanelHead, densePanelSx } from "@/Components/Visual/DashboardAreas";
import type { WeekPlanRow } from "@/types/work";

/**
 * The week ahead at the sites in scope, under Business days: who opens, closes
 * and drives each day, who said yes (✓) or can't (✗), and the gaps in red.
 * A day opens that week on the Rota.
 */
export default function WeekPlanPanel({ rows }: { rows: WeekPlanRow[] }): React.ReactElement | null {
    if (rows.length === 0) return null;

    return (
        <Box sx={densePanelSx}>
            <PanelHead icon={<EventAvailableOutlined fontSize="small" />} title="The week ahead: who opens, closes and drives" />
            <WeekPlan app="admin" rows={rows} flat />
        </Box>
    );
}
