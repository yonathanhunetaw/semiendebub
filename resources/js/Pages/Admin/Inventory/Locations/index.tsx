import AdminLayout from "@/Layouts/AppLayout";
import { Head, router } from "@inertiajs/react";
import {
    Autocomplete,
    Box,
    Button,
    Chip,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React, { useState } from "react";

interface Manager {
    id: number;
    name: string;
    primary: boolean;
}

interface LocationRow {
    id: number;
    name: string;
    code: string;
    kind: "shelf" | "backroom" | "remote_hub" | "main_hub" | "store";
    kind_label: string;
    units: number;
    managers: Manager[];
}

interface StoreGroup {
    id: number;
    name: string;
    code: string;
    locations: LocationRow[];
}

interface Candidate {
    id: number;
    name: string;
    role: string;
}

interface Props {
    hubs?: LocationRow[];
    stores?: StoreGroup[];
    candidates?: Candidate[];
    /** Units in couriers' hands right now. */
    in_delivery?: number;
}

/** Material Symbols name per kind. */
const ICON: Record<string, string> = {
    shelf: "shelves",
    backroom: "storefront",
    remote_hub: "warehouse",
    main_hub: "hub",
};

/** At most two managers per location; the first is the primary. */
const MAX_MANAGERS = 2;

/**
 * Locations — the one tree (STOCK_PLAN.md §5) and who runs each place.
 *
 * Main Hub A and B, then every store with its Store Shelf, Store (floor) and
 * Remote Hub. A location's managers hand stock out of it and take stock into
 * it: dispatching a transfer to a courier, agreeing a shipment as its dock,
 * receiving from Delivery. A location with no managers is run by role.
 */
export default function LocationsIndex({ hubs = [], stores = [], candidates = [], in_delivery = 0 }: Props): React.ReactElement {
    return (
        <>
            <Head title="Locations" />

            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Locations
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Every place stock can sit, and the one or two people who run each. The first manager is the primary.
                </Typography>

                <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3, bgcolor: "#fff7ed" }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <span className="material-symbols-outlined">local_shipping</span>
                        <Box>
                            <Typography sx={{ fontWeight: 700 }}>
                                In Delivery · {in_delivery.toLocaleString()} units
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Handed to a courier and not yet handed over — transfers, shipments and customer orders on the road.
                            </Typography>
                        </Box>
                    </Stack>
                </Paper>

                <Typography variant="overline" color="text.secondary">
                    Main Hubs
                </Typography>
                <Stack spacing={1.5} sx={{ mb: 3 }}>
                    {hubs.map((hub) => (
                        <LocationCard key={hub.id} location={hub} candidates={candidates} />
                    ))}
                </Stack>

                {stores.map((store) => (
                    <Box key={store.id} sx={{ mb: 3 }}>
                        <Typography variant="overline" color="text.secondary">
                            {store.name} · {store.code}
                        </Typography>
                        <Stack spacing={1.5}>
                            {store.locations.map((location) => (
                                <LocationCard key={location.id} location={location} candidates={candidates} />
                            ))}
                        </Stack>
                    </Box>
                ))}
            </Box>
        </>
    );
}

function LocationCard({ location, candidates }: { location: LocationRow; candidates: Candidate[] }): React.ReactElement {
    const [editing, setEditing] = useState(false);
    const [chosen, setChosen] = useState<Candidate[]>(
        location.managers
            .map((manager) => candidates.find((c) => c.id === manager.id))
            .filter((c): c is Candidate => c !== undefined),
    );
    const [saving, setSaving] = useState(false);

    const save = (): void => {
        setSaving(true);
        router.post(
            route("admin.inventory.stock-locations.managers", location.id),
            { manager_ids: chosen.map((c) => c.id) },
            {
                preserveScroll: true,
                onSuccess: () => setEditing(false),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between">
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            bgcolor: "#0b1c30",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        <span className="material-symbols-outlined">{ICON[location.kind] ?? "location_on"}</span>
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>
                            {location.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                            {location.kind_label} · {location.code} · {location.units.toLocaleString()} units
                        </Typography>
                    </Box>
                </Stack>

                {editing ? (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { sm: 420 } }}>
                        <Autocomplete
                            multiple
                            fullWidth
                            size="small"
                            options={candidates}
                            value={chosen}
                            getOptionLabel={(c) => `${c.name} (${c.role.replace("_", " ")})`}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            getOptionDisabled={(option) =>
                                chosen.length >= MAX_MANAGERS && !chosen.some((c) => c.id === option.id)
                            }
                            onChange={(_event, value) => setChosen(value.slice(0, MAX_MANAGERS))}
                            renderInput={(params) => (
                                <TextField {...params} label="Managers (max 2, primary first)" />
                            )}
                        />
                        <Button variant="contained" onClick={save} disabled={saving}>
                            Save
                        </Button>
                        <Button onClick={() => setEditing(false)}>Cancel</Button>
                    </Stack>
                ) : (
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        {location.managers.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                No managers — run by role
                            </Typography>
                        ) : (
                            location.managers.map((manager) => (
                                <Chip
                                    key={manager.id}
                                    size="small"
                                    label={manager.primary ? `${manager.name} · primary` : manager.name}
                                    color={manager.primary ? "primary" : "default"}
                                />
                            ))
                        )}
                        <Button size="small" onClick={() => setEditing(true)}>
                            {location.managers.length === 0 ? "Assign" : "Change"}
                        </Button>
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}

LocationsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
