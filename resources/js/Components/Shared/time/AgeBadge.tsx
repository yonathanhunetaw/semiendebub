import { Chip } from "@mui/material";
import React from "react";
import { ageText } from "@/utils/dates";

/**
 * How long something has waited ("3 h", "2 d"). Quiet at first, amber after
 * `warnHours`, red after `lateHours`.
 */
export default function AgeBadge({
    since,
    warnHours = 24,
    lateHours = 72,
    prefix = "",
}: {
    since: string | null | undefined;
    warnHours?: number;
    lateHours?: number;
    prefix?: string;
}): React.ReactElement | null {
    const age = ageText(since);
    if (age === null) return null;

    const hours = (Date.now() - new Date(since as string).getTime()) / 3_600_000;

    return (
        <Chip
            size="small"
            variant={hours >= warnHours ? "filled" : "outlined"}
            color={hours >= lateHours ? "error" : hours >= warnHours ? "warning" : "default"}
            label={`${prefix}${age}`}
            sx={{ height: 20, fontSize: 11 }}
        />
    );
}
