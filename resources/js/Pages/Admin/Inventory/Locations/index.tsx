import AdminLayout from "@/Layouts/AppLayout";
import { Head, router } from "@inertiajs/react";
import {
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React, { useState } from "react";

interface Manager {
    id: number;
    name: string;
    primary: boolean;
    /** Tick boxes that are on (FacilityManager::ABILITIES keys). */
    abilities: string[];
}

interface Staff {
    id: number;
    name: string;
}

interface LocationRow {
    id: number;
    name: string;
    code: string;
    kind: "shelf" | "backroom" | "remote_hub" | "main_hub" | "store";
    kind_label: string;
    units: number;
    managers: Manager[];
    staff: Staff[];
}

interface StoreGroup {
    id: number;
    name: string;
    code: string;
    /** The store as a whole: its managers and stock keepers reach every location below. */
    node: LocationRow;
    locations: LocationRow[];
}

interface Candidate {
    id: number;
    name: string;
    role: string;
}

interface Ability {
    key: string;
    label: string;
}

interface Props {
    hubs?: LocationRow[];
    stores?: StoreGroup[];
    candidates?: Candidate[];
    staff_candidates?: Candidate[];
    abilities?: Ability[];
    /** Units in couriers' hands right now. */
    in_delivery?: number;
}

/** Material Symbols name per kind. */
const ICON: Record<string, string> = {
    store: "store",
    shelf: "shelves",
    backroom: "storefront",
    remote_hub: "warehouse",
    main_hub: "hub",
};

const iconBoxSx = {
    width: 40,
    height: 40,
    borderRadius: 2,
    bgcolor: "#0b1c30",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
} as const;

/**
 * Locations — the one tree (STOCK_PLAN.md §5) and who runs each place.
 *
 * Main Hub A and B, then every store: the store as a whole, and its Store
 * Shelf, Store (floor) and Remote Hub. Each location has any number of
 * managers, each with tick boxes for what they may do there, and any number of
 * stock keepers. Whoever runs a store runs everything in it.
 */
export default function LocationsIndex({
    hubs = [],
    stores = [],
    candidates = [],
    staff_candidates = [],
    abilities = [],
    in_delivery = 0,
}: Props): React.ReactElement {
    const shared = { candidates, staffCandidates: staff_candidates, abilities };

    return (
        <>
            <Head title="Locations" />

            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: "auto" }}>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Locations
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Every place stock can sit, who manages it and what each manager may do, and its stock keepers. A store's managers
                    and stock keepers also run its shelf, floor and Remote Hub.
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
                        <LocationCard key={hub.id} location={hub} {...shared} />
                    ))}
                </Stack>

                {stores.map((store) => (
                    <Box key={store.id} sx={{ mb: 3 }}>
                        <Typography variant="overline" color="text.secondary">
                            {store.name} · {store.code}
                        </Typography>
                        <Stack spacing={1.5}>
                            <LocationCard location={store.node} {...shared} />
                            {store.locations.map((location) => (
                                <LocationCard key={location.id} location={location} inheritsFrom={store.name} {...shared} />
                            ))}
                        </Stack>
                    </Box>
                ))}
            </Box>
        </>
    );
}

function LocationCard({
    location,
    candidates,
    staffCandidates,
    abilities,
    inheritsFrom,
}: {
    location: LocationRow;
    candidates: Candidate[];
    staffCandidates: Candidate[];
    abilities: Ability[];
    /** Set for a location inside a store: the store's people reach it too. */
    inheritsFrom?: string;
}): React.ReactElement {
    const [editingManagers, setEditingManagers] = useState(false);
    const [editingStaff, setEditingStaff] = useState(false);

    return (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, ...(location.kind === "store" ? { bgcolor: "#f8fafc" } : {}) }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }} justifyContent="space-between">
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box sx={iconBoxSx}>
                        <span className="material-symbols-outlined">{ICON[location.kind] ?? "location_on"}</span>
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>
                            {location.kind === "store" ? `${location.name} — whole store` : location.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                            {location.kind_label} · {location.code}
                            {location.kind !== "store" ? ` · ${location.units.toLocaleString()} units` : ""}
                        </Typography>
                        {inheritsFrom ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                Also run by {inheritsFrom}&apos;s managers and stock keepers.
                            </Typography>
                        ) : null}
                    </Box>
                </Stack>

                <Stack spacing={1} sx={{ minWidth: { sm: 360 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 92 }}>
                            Managers
                        </Typography>
                        {location.managers.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                None{inheritsFrom ? " here" : " — run by role"}
                            </Typography>
                        ) : (
                            location.managers.map((manager) => (
                                <Tooltip
                                    key={manager.id}
                                    title={
                                        manager.abilities.length === abilities.length
                                            ? "Every tick"
                                            : abilities.filter((a) => manager.abilities.includes(a.key)).map((a) => a.label).join(", ") || "No ticks"
                                    }
                                >
                                    <Chip
                                        size="small"
                                        label={`${manager.name}${manager.primary ? " · primary" : ""} · ${manager.abilities.length}/${abilities.length}`}
                                        color={manager.primary ? "primary" : "default"}
                                    />
                                </Tooltip>
                            ))
                        )}
                        <Button size="small" onClick={() => setEditingManagers(true)}>
                            {location.managers.length === 0 ? "Assign" : "Change"}
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 92 }}>
                            Stock keepers
                        </Typography>
                        {location.staff.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">
                                None{inheritsFrom ? " here" : ""}
                            </Typography>
                        ) : (
                            location.staff.map((person) => <Chip key={person.id} size="small" variant="outlined" label={person.name} />)
                        )}
                        <Button size="small" onClick={() => setEditingStaff(true)}>
                            {location.staff.length === 0 ? "Assign" : "Change"}
                        </Button>
                    </Stack>
                </Stack>
            </Stack>

            {editingManagers ? (
                <ManagersDialog location={location} candidates={candidates} abilities={abilities} onClose={() => setEditingManagers(false)} />
            ) : null}
            {editingStaff ? <StaffDialog location={location} candidates={staffCandidates} onClose={() => setEditingStaff(false)} /> : null}
        </Paper>
    );
}

interface Draft {
    id: number;
    name: string;
    abilities: string[];
}

function ManagersDialog({
    location,
    candidates,
    abilities,
    onClose,
}: {
    location: LocationRow;
    candidates: Candidate[];
    abilities: Ability[];
    onClose: () => void;
}): React.ReactElement {
    const allTicks = abilities.map((a) => a.key);
    const [drafts, setDrafts] = useState<Draft[]>(location.managers.map((m) => ({ id: m.id, name: m.name, abilities: m.abilities })));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const add = (candidate: Candidate | null): void => {
        if (!candidate || drafts.some((d) => d.id === candidate.id)) return;
        // A new manager starts with every tick.
        setDrafts((current) => [...current, { id: candidate.id, name: candidate.name, abilities: allTicks }]);
    };

    const toggle = (id: number, key: string): void =>
        setDrafts((current) =>
            current.map((d) => (d.id === id ? { ...d, abilities: d.abilities.includes(key) ? d.abilities.filter((k) => k !== key) : [...d.abilities, key] } : d)),
        );

    const remove = (id: number): void => setDrafts((current) => current.filter((d) => d.id !== id));

    const save = (): void => {
        setSaving(true);
        router.post(
            route("admin.inventory.stock-locations.managers", location.id),
            { managers: drafts.map((d) => ({ user_id: d.id, abilities: allTicks.filter((k) => d.abilities.includes(k)) })) },
            {
                preserveScroll: true,
                onSuccess: () => onClose(),
                onError: (errors) => setError(Object.values(errors)[0] ?? "Could not save."),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Managers · {location.kind === "store" ? `${location.name} (whole store)` : location.name}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Any number of managers. Each may do only what is ticked. The first is the primary.
                    {location.kind === "store" ? " Managers of the whole store run its shelf, floor and Remote Hub too." : ""}
                </Typography>

                <Autocomplete
                    size="small"
                    options={candidates.filter((c) => !drafts.some((d) => d.id === c.id))}
                    getOptionLabel={(c) => `${c.name} (${c.role.replace("_", " ")})`}
                    onChange={(_event, value) => add(value)}
                    value={null}
                    renderInput={(params) => <TextField {...params} label="Add a manager" />}
                    sx={{ mb: 2 }}
                />

                {drafts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        No managers. {location.kind === "shelf" ? "Only admin/dev can then change this shelf's planogram." : ""}
                    </Typography>
                ) : (
                    <Stack spacing={1.5} divider={<Divider flexItem />}>
                        {drafts.map((draft, index) => (
                            <Box key={draft.id}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography sx={{ fontWeight: 700 }}>
                                        {draft.name}
                                        {index === 0 ? " · primary" : ""}
                                    </Typography>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Button size="small" onClick={() => setDrafts((c) => c.map((d) => (d.id === draft.id ? { ...d, abilities: allTicks } : d)))}>
                                            All
                                        </Button>
                                        <Button size="small" onClick={() => setDrafts((c) => c.map((d) => (d.id === draft.id ? { ...d, abilities: [] } : d)))}>
                                            None
                                        </Button>
                                        <IconButton size="small" aria-label={`Remove ${draft.name}`} onClick={() => remove(draft.id)}>
                                            <span className="material-symbols-outlined">close</span>
                                        </IconButton>
                                    </Stack>
                                </Stack>
                                <Stack direction="row" flexWrap="wrap" useFlexGap columnGap={1}>
                                    {abilities.map((ability) => (
                                        <FormControlLabel
                                            key={ability.key}
                                            control={<Checkbox size="small" checked={draft.abilities.includes(ability.key)} onChange={() => toggle(draft.id, ability.key)} />}
                                            label={<Typography variant="body2">{ability.label}</Typography>}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                )}

                {error ? (
                    <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                        {error}
                    </Typography>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={saving}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function StaffDialog({ location, candidates, onClose }: { location: LocationRow; candidates: Candidate[]; onClose: () => void }): React.ReactElement {
    const [chosen, setChosen] = useState<Candidate[]>(
        location.staff.map((s) => candidates.find((c) => c.id === s.id) ?? { id: s.id, name: s.name, role: "stock_keeper" }),
    );
    const [saving, setSaving] = useState(false);

    const save = (): void => {
        setSaving(true);
        router.post(
            route("admin.inventory.stock-locations.staff", location.id),
            { staff_ids: chosen.map((c) => c.id) },
            { preserveScroll: true, onSuccess: () => onClose(), onFinish: () => setSaving(false) },
        );
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Stock keepers · {location.kind === "store" ? `${location.name} (whole store)` : location.name}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Any number. Stock keepers suggest refills and shelve.
                    {location.kind === "store" ? " Stock keepers of the whole store work its shelf, floor and Remote Hub." : ""}
                </Typography>
                <Autocomplete
                    multiple
                    size="small"
                    options={candidates}
                    value={chosen}
                    getOptionLabel={(c) => c.name}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    onChange={(_event, value) => setChosen(value)}
                    renderInput={(params) => <TextField {...params} label="Stock keepers" />}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={saving}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

LocationsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
