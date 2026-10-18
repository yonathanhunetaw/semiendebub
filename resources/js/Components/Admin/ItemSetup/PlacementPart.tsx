import * as React from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { router } from "@inertiajs/react";

import type { Place } from "@/types/itemSetup";
import { useDraft } from "@/hooks/useDraft";

type Limits = { max: string; refill: string; critical: string };

const toLimits = (place: Place): Limits => ({
    max: place.band ? String(place.band.max) : "",
    refill: place.band ? String(place.band.refill) : "",
    critical: place.band ? String(place.band.critical) : "",
});

/** One place's limits for the item (a shelf bin or a Remote Hub level), saved on its own. */
function PlaceCard({ itemId, place }: { itemId: number; place: Place }) {
    const saved = React.useMemo(() => toLimits(place), [place]);
    const draft = useDraft<Limits>(`duka.itemSetup.${itemId}.bin.${place.location_id}`, saved);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const label = place.kind === "shelf" ? "Shelf bin" : "Level";

    const run = (method: "put" | "delete") => {
        setBusy(true);
        const url = route(method === "put" ? "admin.items.setup.bin" : "admin.items.setup.bin.destroy", [itemId, place.location_id]);
        const options = {
            preserveScroll: true,
            preserveState: true,
            only: ["readiness", "stores", "flash", "errors"],
            onSuccess: () => {
                draft.clear();
                setError(null);
            },
            onError: (e: Record<string, string>) => setError(Object.values(e).join(" ")),
            onFinish: () => setBusy(false),
        };
        method === "put" ? router.put(url, draft.value, options) : router.delete(url, options);
    };

    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 700 }}>{place.name}</Typography>
                <Typography variant="caption" color="text.secondary">{label} · {place.pieces.toLocaleString()} pieces held now</Typography>
            </Stack>
            {draft.restored && <Alert severity="info" variant="outlined" sx={{ my: 1 }} action={<Button size="small" onClick={draft.discard}>Discard</Button>}>Your unsaved changes were kept from last time.</Alert>}
            {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
            <Stack direction="row" spacing={1} sx={{ my: 1, flexWrap: "wrap", rowGap: 1 }}>
                {(["max", "refill", "critical"] as const).map((field) => (
                    <TextField
                        key={field}
                        size="small"
                        type="number"
                        label={field === "max" ? "Full (max)" : field === "refill" ? "Refill at" : "Critical at"}
                        value={draft.value[field]}
                        onChange={(e) => draft.setValue((v) => ({ ...v, [field]: e.target.value }))}
                        disabled={!place.can_edit}
                        inputProps={{ min: 0, "aria-label": `${place.name} ${field}` }}
                        sx={{ width: 140 }}
                    />
                ))}
            </Stack>
            {place.can_edit ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Button variant="contained" size="small" onClick={() => run("put")} disabled={busy || !draft.dirty || draft.value.max === ""}>Save limits</Button>
                    {place.band && <Button size="small" color="error" onClick={() => run("delete")} disabled={busy}>Take off this place</Button>}
                    {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
                </Stack>
            ) : (
                <Alert severity="info" variant="outlined">
                    Only {place.managers.length > 0 ? place.managers.join(", ") : "an admin (nobody manages this place yet)"} may change these limits.
                </Alert>
            )}
        </Box>
    );
}

export default function PlacementPart({ itemId, places }: { itemId: number; places: Place[] }) {
    if (places.length === 0) {
        return <Typography color="text.secondary">This store has no shelf or Remote Hub.</Typography>;
    }

    return (
        <Stack spacing={1.5}>
            {places.map((place) => (
                <PlaceCard key={place.location_id} itemId={itemId} place={place} />
            ))}
        </Stack>
    );
}
