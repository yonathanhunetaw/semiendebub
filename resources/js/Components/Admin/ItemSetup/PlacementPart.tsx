import * as React from "react";
import { Alert, Box, Button, Checkbox, Stack, TextField, Typography } from "@mui/material";
import { router } from "@inertiajs/react";

import type { Place, RefillRoute } from "@/types/itemSetup";
import { RELOAD } from "@/Components/Admin/ItemSetup/VariantsPart";
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
    const label = { shelf: "Shelf bin", backroom: "Floor level", remote_hub: "Remote Hub level", main_hub: "Warehouse level" }[place.kind] ?? "Level";

    const run = (method: "put" | "delete") => {
        setBusy(true);
        const url = route(method === "put" ? "admin.items.setup.bin" : "admin.items.setup.bin.destroy", [itemId, place.location_id]);
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

const SOURCE_LABELS: Record<string, string> = {
    floor: "The store floor (back room)",
    remote_hub: "The Remote Hub",
    shipment: "A shipment from the main warehouse",
};

/** Where the store refills the shelf from, in order: tick the sources and order them. */
function RouteCard({ itemId, storeId, route }: { itemId: number; storeId: number; route: RefillRoute }) {
    const draft = useDraft<string[]>(`duka.itemSetup.${itemId}.route.${storeId}`, route.sources);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const ordered = [...draft.value, ...route.available.filter((s) => !draft.value.includes(s))];

    const move = (source: string, by: -1 | 1) =>
        draft.setValue((list) => {
            const i = list.indexOf(source);
            const j = i + by;
            if (i < 0 || j < 0 || j >= list.length) return list;
            const next = [...list];
            [next[i], next[j]] = [next[j], next[i]];

            return next;
        });

    const save = () => {
        setBusy(true);
        router.put(route_url(storeId, itemId), { sources: draft.value }, {
            preserveScroll: true,
            preserveState: true,
            only: RELOAD,
            onSuccess: () => {
                draft.clear();
                setError(null);
            },
            onError: (e) => setError(Object.values(e).join(" ")),
            onFinish: () => setBusy(false),
        });
    };

    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>Refill route</Typography>
            <Typography variant="caption" color="text.secondary">Where the shelf is refilled from, first choice first{route.set ? "" : " (the store's default until you save one)"}.</Typography>
            {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
            <Stack spacing={0.5} sx={{ my: 1 }}>
                {ordered.map((source) => {
                    const on = draft.value.includes(source);
                    const index = draft.value.indexOf(source);

                    return (
                        <Stack key={source} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Checkbox size="small" checked={on} disabled={!route.can_edit} onChange={(e) => draft.setValue((list) => (e.target.checked ? [...list, source] : list.filter((s) => s !== source)))} inputProps={{ "aria-label": SOURCE_LABELS[source] ?? source }} />
                            <Typography variant="body2" sx={{ flex: 1 }} color={on ? "text.primary" : "text.secondary"}>{on ? `${index + 1}. ` : ""}{SOURCE_LABELS[source] ?? source}</Typography>
                            {on && route.can_edit && (
                                <>
                                    <Button size="small" onClick={() => move(source, -1)} disabled={index === 0} aria-label={`Move ${SOURCE_LABELS[source] ?? source} up`}>Up</Button>
                                    <Button size="small" onClick={() => move(source, 1)} disabled={index === draft.value.length - 1} aria-label={`Move ${SOURCE_LABELS[source] ?? source} down`}>Down</Button>
                                </>
                            )}
                        </Stack>
                    );
                })}
            </Stack>
            {route.can_edit ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Button variant="contained" size="small" onClick={save} disabled={busy || !draft.dirty || draft.value.length === 0}>Save route</Button>
                    {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
                </Stack>
            ) : (
                <Alert severity="info" variant="outlined">Only {route.managers.length > 0 ? route.managers.join(", ") : "an admin"} may change this route.</Alert>
            )}
        </Box>
    );
}

const route_url = (storeId: number, itemId: number): string => route("admin.items.setup.route", [itemId, storeId]);

export default function PlacementPart({ itemId, storeId, places, refillRoute, warehouses = [] }: { itemId: number; storeId: number; places: Place[]; refillRoute: RefillRoute; warehouses?: Place[] }) {
    return (
        <Stack spacing={1.5}>
            {places.length === 0 && <Typography color="text.secondary">This store has no shelf, floor or Remote Hub.</Typography>}
            {places.map((place) => (
                <PlaceCard key={place.location_id} itemId={itemId} place={place} />
            ))}
            <RouteCard itemId={itemId} storeId={storeId} route={refillRoute} />
            {warehouses.length > 0 && (
                <>
                    <Typography sx={{ fontWeight: 700, pt: 1 }}>Warehouses (shared by every store)</Typography>
                    {warehouses.map((place) => (
                        <PlaceCard key={place.location_id} itemId={itemId} place={place} />
                    ))}
                </>
            )}
        </Stack>
    );
}
