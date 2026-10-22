import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "@inertiajs/react";
import { Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import { stationLive } from "./actions";
import { getGame, setGame } from "./gameStore";
import { buildPayload, initialValues, isWorthShowing, visibleItems, whatIsWrong, type Station, type StationAction, type StationItem, type Values } from "./stations";
import { DESKS, type ZoneKey } from "./zones";

/**
 * The desks of the world, the screen side (stations.ts for the rules). A desk
 * lists what its module has waiting and the actions the server offers the
 * viewer. Live posts each to the route the server named; Practice rehearses
 * it (the item is struck off for the session, nothing is sent).
 */

export type StationNote = { tone: "success" | "info" | "warning" | "error"; text: string };

/** The stations whose desk is this zone and which are worth showing. */
export function stationsAt(stations: Station[] | null, zone: ZoneKey | null, struck: ReadonlySet<string>): Station[] {
    if (!stations || !zone) return [];
    return stations.filter((s) => s.desk === zone && isWorthShowing(s, struck));
}

/** The desks that have a station to show (to light them up). */
export function deskZones(stations: Station[] | null, struck: ReadonlySet<string>): ZoneKey[] {
    if (!stations) return [];
    return [...new Set(stations.filter((s) => isWorthShowing(s, struck)).map((s) => s.desk as ZoneKey))];
}

/** One goal per desk with work waiting (tap it to walk there). */
export function deskGoals(stations: Station[] | null, struck: ReadonlySet<string>): Array<{ text: string; go: ZoneKey }> {
    if (!stations) return [];
    const byDesk = new Map<string, { label: string; n: number }>();
    for (const s of stations) {
        const n = visibleItems(s, struck).length;
        if (n === 0) continue;
        const entry = byDesk.get(s.desk);
        byDesk.set(s.desk, { label: entry ? `${entry.label} · ${s.label}` : s.label, n: (entry?.n ?? 0) + n });
    }
    return [...byDesk.entries()].map(([desk, { label, n }]) => ({ go: desk as ZoneKey, text: `${label}: ${n} waiting →` }));
}

export function useStations(stations: Station[] | null, note: (n: StationNote) => void, reread: () => void) {
    const [struck, setStruck] = useState<ReadonlySet<string>>(new Set());
    const busy = useRef(false);
    // A fresh list from the server is the truth again: a rehearsal no longer hides what is really still there.
    useEffect(() => setStruck(new Set()), [stations]);

    const perform = useCallback(async (station: Station, item: StationItem, action: StationAction, values: Values): Promise<boolean> => {
        if (busy.current) return false;
        const wrong = whatIsWrong(action, values);
        if (wrong) {
            note({ tone: "warning", text: wrong });
            return false;
        }
        const live = getGame().live;
        const what = `${action.label}: ${item.title}`;
        if (!live) {
            setStruck((old) => new Set(old).add(`${station.key}:${item.id}`));
            note({ tone: "info", text: `${what}. Practice: nothing was saved.` });
            return true;
        }
        busy.current = true;
        setGame({ saving: true });
        const answer = await stationLive(action.method, action.url, buildPayload(action, values), what);
        busy.current = false;
        setGame({ saving: false });
        note({ tone: answer.ok ? "success" : "error", text: answer.ok ? `${answer.message} (for real)` : answer.message });
        reread();
        return answer.ok;
    }, [note, reread]);

    return { struck, perform };
}

export function StationCards({ stations, struck, live, saving, onPerform, onClose }: {
    stations: Station[];
    struck: ReadonlySet<string>;
    live: boolean;
    saving: boolean;
    onPerform: (station: Station, item: StationItem, action: StationAction, values: Values) => Promise<boolean>;
    onClose: () => void;
}) {
    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", position: "relative", zIndex: 20, width: "100%", maxWidth: 440, maxHeight: { xs: "52dvh", sm: "58dvh" }, display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }} noWrap>{stations.map((s) => s.label).join(" · ")}</Typography>
                {live && <Chip size="small" color="error" label="Live" sx={{ fontWeight: 800 }} />}
                <IconButton size="small" onClick={onClose} aria-label="Close the desk"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {stations.map((station) => <StationBlock key={station.key} station={station} struck={struck} live={live} saving={saving} onPerform={onPerform} showTitle={stations.length > 1} />)}
            </Box>
        </Paper>
    );
}

function StationBlock({ station, struck, live, saving, onPerform, showTitle }: {
    station: Station;
    struck: ReadonlySet<string>;
    live: boolean;
    saving: boolean;
    onPerform: (station: Station, item: StationItem, action: StationAction, values: Values) => Promise<boolean>;
    showTitle: boolean;
}) {
    const items = visibleItems(station, struck);
    return (
        <Box data-testid={`station-${station.key}`}>
            {(showTitle || station.blurb) && (
                <Box sx={{ px: 1.5, pt: 1 }}>
                    {showTitle && <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{station.label}</Typography>}
                    {station.blurb && <Typography variant="caption" color="text.secondary">{station.blurb}</Typography>}
                </Box>
            )}
            {station.stats && station.stats.length > 0 && (
                <Stack direction="row" spacing={0.75} sx={{ px: 1.5, py: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                    {station.stats.map((stat) => <Chip key={stat.label} size="small" variant="outlined" label={`${stat.value} ${stat.label}`} sx={{ fontWeight: 700 }} />)}
                </Stack>
            )}
            {items.map((item) => <ItemCard key={item.id} station={station} item={item} live={live} saving={saving} onPerform={onPerform} />)}
            {items.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.25 }}>{station.empty ?? "Nothing waiting here."}</Typography>}
            {(station.open || (station.links?.length ?? 0) > 0) && (
                <Stack direction="row" sx={{ px: 1.5, pb: 1, flexWrap: "wrap" }}>
                    {[...(station.open ? [station.open] : []), ...(station.links ?? [])].map((link) => (
                        <Button key={link.url} size="small" onClick={() => router.visit(link.url)} sx={{ textTransform: "none", fontWeight: 800 }}>{link.label} ↗</Button>
                    ))}
                </Stack>
            )}
        </Box>
    );
}

function ItemCard({ station, item, live, saving, onPerform }: {
    station: Station;
    item: StationItem;
    live: boolean;
    saving: boolean;
    onPerform: (station: Station, item: StationItem, action: StationAction, values: Values) => Promise<boolean>;
}) {
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [values, setValues] = useState<Values>({});
    const [asking, setAsking] = useState<string | null>(null);
    const action = item.actions.find((a) => a.key === openKey) ?? null;

    const run = async (a: StationAction, v: Values) => {
        const ok = await onPerform(station, item, a, v);
        if (ok) {
            setOpenKey(null);
            setAsking(null);
        }
    };
    const choose = (a: StationAction) => {
        if (a.fields && a.fields.length > 0) {
            setOpenKey(a.key);
            setValues(initialValues(a.fields));
            setAsking(null);
        } else if (a.confirm && asking !== a.key) {
            setAsking(a.key);
        } else {
            void run(a, {});
        }
    };

    return (
        <Stack spacing={0.75} sx={{ px: 1.5, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }} data-testid={`item-${station.key}-${item.id}`}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>{item.title}</Typography>
                    {item.subtitle && <Typography variant="caption" color="text.secondary">{item.subtitle}</Typography>}
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 0.5 }}>
                    {(item.chips ?? []).map((chip) => <Chip key={chip.label} size="small" label={chip.label} color={chip.tone && chip.tone !== "default" ? chip.tone : undefined} sx={{ fontWeight: 700 }} />)}
                </Stack>
            </Stack>
            {(item.lines ?? []).map((line) => <Typography key={line} variant="caption" color="text.secondary" sx={{ display: "block" }}>{line}</Typography>)}

            {action && action.fields && (
                <Stack spacing={0.75} sx={{ py: 0.5 }}>
                    {action.fields.map((field) => (
                        <TextField key={field.name} size="small" label={field.label} value={values[field.name] ?? ""} disabled={saving}
                            type={field.type === "number" ? "number" : "text"} multiline={field.type === "textarea"} select={field.type === "select"}
                            onChange={(e) => setValues((old) => ({ ...old, [field.name]: e.target.value }))}
                            slotProps={{ htmlInput: { min: field.min, max: field.max, "data-testid": `field-${field.name}` } }}>
                            {field.type === "select" && (field.options ?? []).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </TextField>
                    ))}
                    <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" color={live ? "error" : (action.tone ?? "primary")} disabled={saving} onClick={() => void run(action, values)} sx={{ flex: 1, borderRadius: 999, fontWeight: 900, textTransform: "none" }}>
                            {live ? `${action.label} (for real)` : action.label}{action.navigates ? " ↗" : ""}
                        </Button>
                        <Button size="small" color="inherit" onClick={() => setOpenKey(null)} sx={{ textTransform: "none", fontWeight: 800 }}>Not now</Button>
                    </Stack>
                </Stack>
            )}

            {!action && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
                    {item.actions.map((a) => asking === a.key ? (
                        <Stack key={a.key} direction="row" spacing={0.75} alignItems="center">
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>{a.confirm}</Typography>
                            <Button size="small" variant="contained" color="error" disabled={saving} onClick={() => void run(a, {})} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none" }}>Yes</Button>
                            <Button size="small" color="inherit" onClick={() => setAsking(null)} sx={{ textTransform: "none", fontWeight: 800 }}>No</Button>
                        </Stack>
                    ) : (
                        <Button key={a.key} size="small" variant={a.tone === "inherit" ? "outlined" : "contained"} color={live && a.tone !== "inherit" ? "error" : (a.tone ?? "primary")} disabled={saving} onClick={() => choose(a)}
                            sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none" }}>
                            {live && a.tone !== "inherit" ? `${a.label} (for real)` : a.label}
                        </Button>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

/** Every desk this viewer has, with how much waits at each: tap one to walk there. */
export function DeskMenu({ stations, struck, onWalk, onClose }: { stations: Station[] | null; struck: ReadonlySet<string>; onWalk: (desk: ZoneKey) => void; onClose: () => void }) {
    const byDesk = new Map<string, { names: string[]; waiting: number }>();
    for (const station of stations ?? []) {
        if (!isWorthShowing(station, struck)) continue;
        const entry = byDesk.get(station.desk) ?? { names: [], waiting: 0 };
        entry.names.push(station.label);
        entry.waiting += visibleItems(station, struck).length;
        byDesk.set(station.desk, entry);
    }
    const rows = DESKS.filter((d) => byDesk.has(d.key)).map((d) => ({ key: d.key as ZoneKey, label: d.label, ...byDesk.get(d.key)! }))
        .sort((a, b) => Number(b.waiting > 0) - Number(a.waiting > 0));

    return (
        <Paper elevation={0} data-testid="desk-menu" sx={{ pointerEvents: "auto", position: "relative", zIndex: 20, width: "100%", maxWidth: 420, maxHeight: "46dvh", display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }}>Desks: tap one to walk there</Typography>
                <IconButton size="small" onClick={onClose} aria-label="Close the desk list"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {rows.map((row) => (
                    <Stack key={row.key} direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{row.label}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>{row.names.join(" · ")}</Typography>
                        </Box>
                        {row.waiting > 0 && <Chip size="small" color="warning" label={`${row.waiting} waiting`} sx={{ fontWeight: 800 }} />}
                        <Button size="small" variant="contained" onClick={() => onWalk(row.key)} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Go</Button>
                    </Stack>
                ))}
                {rows.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No desk has anything for you.</Typography>}
            </Box>
        </Paper>
    );
}
