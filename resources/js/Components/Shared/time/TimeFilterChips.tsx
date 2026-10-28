import { router } from "@inertiajs/react";
import { Chip, Stack } from "@mui/material";
import React from "react";
import type { TimeFilterView } from "@/types/time";

/**
 * Today / Yesterday / Last 7 days / This month / Outside open hours / All.
 * It narrows finished work and totals; work still open is always listed.
 * Keeps every other query parameter (store, search, stage) and goes back to page 1.
 */
export default function TimeFilterChips({
    filter,
    only,
    hide = [],
}: {
    filter: TimeFilterView;
    /** Inertia partial reload keys, when the page can refresh just its lists. */
    only?: string[];
    /** Options this list has no use for ("outside", "all"). */
    hide?: string[];
}): React.ReactElement {
    const pick = (when: string): void => {
        const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
        delete query.page;
        delete query.date;
        router.get(window.location.pathname, { ...query, when }, { preserveState: true, preserveScroll: true, replace: true, ...(only ? { only } : {}) });
    };

    return (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" aria-label="Time">
            {filter.options
                .filter((option) => !hide.includes(option.key))
                .map((option) => {
                    const active = filter.when === option.key;

                    return (
                        <Chip
                            key={option.key}
                            size="small"
                            label={option.label}
                            color={active ? (option.key === "outside" ? "warning" : "primary") : "default"}
                            variant={active ? "filled" : "outlined"}
                            onClick={() => pick(option.key)}
                        />
                    );
                })}
        </Stack>
    );
}
