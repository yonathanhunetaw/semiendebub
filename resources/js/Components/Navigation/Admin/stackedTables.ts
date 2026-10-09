import { useEffect, type RefObject } from "react";
import type { Theme } from "@mui/material";

/**
 * Admin tables become stacked cards on phones and tablets (below md): one card
 * per row, each cell labelled with its column header. No admin table scrolls
 * sideways.
 *
 * The labels are copied from each table's header into the cells' `data-label`
 * (useStackedTableLabels), and the layout's styles (stackedTableSx) do the
 * rest, so pages need no changes. A table that must stay a grid (a matrix whose
 * columns mean nothing on their own) opts out with className="keep-table".
 */

const SELECTOR = "table:not(.keep-table)";

function labelTable(table: HTMLTableElement): void {
    const headerRow = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!headerRow) return;

    // Expand colspans so a body cell finds the header above it.
    const labels: string[] = [];
    for (const cell of Array.from(headerRow.cells)) {
        const text = (cell.textContent ?? "").trim();
        for (let i = 0; i < Math.max(1, cell.colSpan); i++) labels.push(text);
    }

    for (const body of Array.from(table.tBodies)) {
        for (const row of Array.from(body.rows)) {
            let column = 0;
            for (const cell of Array.from(row.cells)) {
                const label = labels[column] ?? "";
                if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
                // A cell spanning the whole row (an empty state, a group heading)
                // reads as a full-width line, not a labelled field.
                cell.toggleAttribute("data-full", cell.colSpan > 1 && cell.colSpan >= labels.length);
                column += Math.max(1, cell.colSpan);
            }
        }
    }
}

/** Keep every table under `ref` labelled, including rows added later. */
export function useStackedTableLabels(ref: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const root = ref.current;
        if (!root) return;

        let frame = 0;
        const run = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => root.querySelectorAll<HTMLTableElement>(SELECTOR).forEach(labelTable));
        };

        run();
        const observer = new MutationObserver(run);
        observer.observe(root, { childList: true, subtree: true, characterData: true });

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [ref]);
}

/** The styles that turn labelled tables into cards below md. */
export function stackedTableSx(theme: Theme) {
    return {
        [theme.breakpoints.down("md")]: {
            "& .MuiTableContainer-root:has(> table:not(.keep-table))": { overflowX: "visible", border: "none", boxShadow: "none", bgcolor: "transparent" },
            [`& ${SELECTOR}`]: { display: "block", minWidth: "0 !important", width: "100%" },
            [`& ${SELECTOR} > thead`]: { display: "none" },
            [`& ${SELECTOR} > tbody, & ${SELECTOR} > tfoot`]: { display: "block" },
            [`& ${SELECTOR} > tbody > tr, & ${SELECTOR} > tfoot > tr`]: {
                display: "block",
                mb: 1.5,
                pb: 0.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 4,
                bgcolor: "background.paper",
                overflow: "hidden",
                boxShadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.04)",
            },
            // The first column is the card's title, on a tinted band like the
            // seller app's cards; the rest are labelled rows below it.
            [`& ${SELECTOR} > tbody > tr > td:first-of-type:not([data-full])`]: {
                justifyContent: "flex-start !important",
                textAlign: "left !important",
                fontWeight: 800,
                fontSize: "0.95rem",
                py: "10px !important",
                mb: 0.5,
                bgcolor: "rgb(var(--primary-container) / 0.45)",
                borderBottom: "1px solid",
                borderColor: "divider",
                "&::before": { display: "none" },
            },
            [`& ${SELECTOR} > tbody > tr > td, & ${SELECTOR} > tbody > tr > th, & ${SELECTOR} > tfoot > tr > td`]: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
                width: "auto !important",
                minWidth: "0 !important",
                maxWidth: "none !important",
                px: 1.5,
                py: 0.75,
                border: "none",
                textAlign: "right !important",
                wordBreak: "break-word",
                "&::before": {
                    content: "attr(data-label)",
                    flexShrink: 0,
                    maxWidth: "45%",
                    textAlign: "left",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                },
                // No header text (an actions column), or a full-row cell.
                '&[data-label=""]::before, &[data-full]::before': { display: "none" },
                '&[data-label=""], &[data-full]': { justifyContent: "flex-end" },
                "&[data-full]": { justifyContent: "flex-start", textAlign: "left !important" },
                // Long content (names, addresses) goes under its label.
                "& > *": { minWidth: 0 },
            },
        },
    };
}
