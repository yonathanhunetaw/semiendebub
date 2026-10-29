import { TableCell, TableRow, Typography } from "@mui/material";
import React from "react";
import type { DayTagView } from "@/types/time";
import { dayDate } from "@/utils/dates";

/** What rows are grouped under: one business day, or the hours a store was closed on one date. */
export function dayGroupKey(tag: DayTagView | null | undefined): string {
    if (!tag) return "none";

    return tag.outside ? `outside:${tag.date}` : tag.key;
}

/** "Today", "Yesterday", "Monday, Oct 19", or "Outside open hours · Monday, Oct 19". */
export function dayGroupLabel(tag: DayTagView | null | undefined): string {
    if (!tag) return "No date";

    return tag.outside ? `Outside open hours · ${dayDate(tag.date)}` : tag.label;
}

/** True where a new day starts in a list (rows keep their own order; a heading marks each change of day). */
export function startsDay<T extends { day?: DayTagView | null }>(rows: T[], index: number): boolean {
    return index === 0 || dayGroupKey(rows[index].day) !== dayGroupKey(rows[index - 1].day);
}

/** A heading row across a table, above the first row of each day. */
export function DayHeadingRow({ tag, colSpan }: { tag: DayTagView | null | undefined; colSpan: number }): React.ReactElement {
    return (
        <TableRow>
            <TableCell colSpan={colSpan} sx={{ bgcolor: tag?.outside ? "warning.light" : "action.hover", py: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: tag?.outside ? "warning.contrastText" : "text.secondary" }}>
                    {dayGroupLabel(tag)}
                </Typography>
            </TableCell>
        </TableRow>
    );
}
