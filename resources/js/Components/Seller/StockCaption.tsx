import { Typography } from "@mui/material";
import React from "react";

/**
 * The stock line under an item on a seller's catalogue card.
 *
 * An active item stays in the catalogue when it runs out — the seller needs to
 * know the store carries it, to tell a customer when it is coming back or to
 * price it into an order being built ahead of a delivery. What changed is only
 * how that reads: "Stock: 0" looked like a figure nobody had got round to
 * filling in, so an out-of-stock item now says so in words.
 *
 * Used by the seller dashboard, the item index and the search results, which
 * had three copies of the same caption.
 */
export default function StockCaption({
    stock,
}: {
    /** Pieces at this seller's store. `undefined` when the caller has no figure. */
    stock?: number;
}): React.ReactElement | null {
    if (stock === undefined || stock === null) {
        return null;
    }

    const out = stock <= 0;

    return (
        <Typography
            variant="caption"
            color={out ? "warning.main" : "text.secondary"}
            sx={{ display: "block", mt: 0.5, fontWeight: out ? 700 : 400 }}
        >
            {out ? "Out of stock" : `Stock: ${stock.toLocaleString()}`}
        </Typography>
    );
}
