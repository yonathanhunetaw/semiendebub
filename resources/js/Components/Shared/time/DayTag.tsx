import { Chip } from "@mui/material";
import React from "react";
import type { DayTagView } from "@/types/time";

/** Which business day a row belongs to; "Outside open hours" stands out. */
export default function DayTag({ tag }: { tag: DayTagView | null | undefined }): React.ReactElement | null {
    if (!tag) return null;

    return (
        <Chip
            size="small"
            variant={tag.outside ? "filled" : "outlined"}
            color={tag.outside ? "warning" : "default"}
            label={tag.label}
            sx={{ height: 20, fontSize: 11 }}
        />
    );
}
