import * as React from "react";
import { router } from "@inertiajs/react";
import { Alert, Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";

import { RELOAD } from "@/Components/Admin/ItemSetup/VariantsPart";
import { useDraft } from "@/hooks/useDraft";
import type { Place } from "@/types/itemSetup";

/** Count the item at one place. A count is recorded, then approved, and only then does the ledger change. */
function CountCard({ itemId, place }: { itemId: number; place: Place }) {
    const { lines, open } = place.count;
    const saved = React.useMemo(() => Object.fromEntries(lines.map((l) => [String(l.variant_id), l.counted === null ? "" : String(l.counted)])) as Record<string, string>, [lines]);
    const draft = useDraft<Record<string, string>>(`duka.itemSetup.${itemId}.count.${place.location_id}`, saved);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const waiting = open?.status === "submitted";

    const options = {
        preserveScroll: true,
        preserveState: true,
        only: RELOAD,
        onSuccess: () => {
            draft.clear();
            setError(null);
        },
        onError: (e: Record<string, string>) => setError(Object.values(e).join(" ")),
        onFinish: () => setBusy(false),
    };
    const send = (url: string, body: Record<string, string | Record<string, string>> = {}) => {
        setBusy(true);
        router.post(url, body, options);
    };

    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 700 }}>{place.name}</Typography>
                <Typography variant="caption" color="text.secondary">{place.pieces.toLocaleString()} pieces held now</Typography>
            </Stack>
            {draft.restored && <Alert severity="info" variant="outlined" sx={{ my: 1 }} action={<Button size="small" onClick={draft.discard}>Discard</Button>}>Your unsaved figures were kept from last time.</Alert>}
            {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

            {open?.status === "counting" && (
                <Alert severity="info" variant="outlined" sx={{ my: 1 }}>
                    A count ({open.reference}) is in progress here, started by {open.started_by}. Figures you save are added to it; it is submitted from the stock keeper app.
                </Alert>
            )}
            {waiting && (
                <Alert severity="warning" variant="outlined" sx={{ my: 1 }}>
                    <Stack spacing={1}>
                        <Typography variant="body2">
                            {open.reference} waits for approval (submitted by {open.submitted_by ?? "someone"}{open.by_me ? ", you" : ""}). Nothing changes in stock until it is approved.
                        </Typography>
                        {open.only_this_item ? (
                            <Stack direction="row" spacing={1}>
                                <Button size="small" variant="contained" disabled={busy} onClick={() => send(route("admin.items.setup.count.approve", [itemId, open.id]))}>Approve and book it</Button>
                                <Button size="small" color="error" disabled={busy} onClick={() => send(route("admin.items.setup.count.void", [itemId, open.id]))}>Void it</Button>
                            </Stack>
                        ) : (
                            <Typography variant="caption">It also counts other items, so it is approved in Admin → Counts, where all of it shows.</Typography>
                        )}
                    </Stack>
                </Alert>
            )}

            <Table size="small">
                <TableHead><TableRow><TableCell>Variant</TableCell><TableCell align="right">In the books</TableCell><TableCell align="right">Counted</TableCell></TableRow></TableHead>
                <TableBody>
                    {lines.map((l) => {
                        const typed = draft.value[String(l.variant_id)] ?? "";
                        const diff = typed === "" ? null : Number(typed) - l.expected;

                        return (
                            <TableRow key={l.variant_id}>
                                <TableCell>{l.label}</TableCell>
                                <TableCell align="right">{l.expected}</TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                                        {diff !== null && diff !== 0 && <Chip size="small" color={diff < 0 ? "error" : "success"} label={diff > 0 ? `+${diff}` : String(diff)} />}
                                        <TextField size="small" type="number" value={typed} disabled={waiting} onChange={(e) => draft.setValue((d) => ({ ...d, [String(l.variant_id)]: e.target.value }))} sx={{ width: 100 }} inputProps={{ min: 0, "aria-label": `Counted ${place.name} ${l.label}` }} />
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
                <Button variant="contained" size="small" disabled={busy || waiting || !draft.dirty} onClick={() => send(route("admin.items.setup.count", [itemId, place.location_id]), { counts: draft.value })}>
                    Save count at {place.name}
                </Button>
                {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved figures (kept if you leave)</Typography>}
            </Stack>
        </Box>
    );
}

export default function StockPart({ itemId, places, warehouses = [] }: { itemId: number; places: Place[]; warehouses?: Place[] }) {
    return (
        <Stack spacing={1.5}>
            {[...places, ...warehouses].map((p) => <CountCard key={p.location_id} itemId={itemId} place={p} />)}
        </Stack>
    );
}
