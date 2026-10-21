import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Paper, Snackbar, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import type { GuideApp } from "@/Components/Guide/chapters";
import { shelveLive } from "./actions";
import { carried as freightCarried, leftAt, startLoading, type FreightState } from "./freight";
import { FreightGauge, HUB_OF, HubPicker, ZONE_OF, useFreightCar } from "./FreightPanel";
import GameHud from "./GameHud";
import type { GameScene } from "./GameScene";
import { getGame, kept, liveConfirmed, setGame, useGame } from "./gameStore";
import { canGoLive, canLoadLive, canShelveLive } from "./permissions";
import { loadPlayFeed, type PlayFeed } from "./playFeed";
import { MAX_CBM, boxesToDraw, cannotPickUp, fill, formatCbm, jobCbm, load, pickUp, putBack, refresh, shelveAll, shelveSome, startPractice, type PracticeState, type ShelveJob } from "./practice";
import { zoneEntrance, type ZoneKey } from "./zones";

/**
 * Play's screen over the world: the top bar (GameHud), a line saying what
 * to do next (tap it to walk there), what you carry against what you can
 * carry, the one button for where you stand, and the picker at the Store
 * Floor.
 *
 * Practice runs every move through practice.ts and saves nothing. Live
 * (stock keepers who may shelve, permissions.ts) runs the same moves, but a
 * put-up is sent to the real Shelve route (actions.ts) job by job: the boxes
 * fly up at once, and any job the server refuses flies back into the
 * worker's arms with the server's reason.
 *
 * The list comes from WorldFeed::play, read now, every 30 s and after every
 * Live put-up; a fresh list merges into the running session without undoing it.
 */

interface Toast {
    tone: "success" | "info" | "warning" | "error";
    text: string;
}

const REFRESH_MS = 30_000;

/** The session as it is right now (not as of the last render), for handlers that run later. */
const getSession = (): PracticeState | null => getGame().session;

export default function PlayLayer({ app, scene }: { app: GuideApp; scene: () => GameScene | null }) {
    const theme = useTheme();
    const game = useGame();
    const session = game.session;
    const [feed, setFeed] = useState<PlayFeed | null>(null);
    const [failed, setFailed] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [asking, setAsking] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);
    const glass = alpha(theme.palette.background.paper, 0.94);
    const liveAllowed = canGoLive(app, feed);
    const freight = game.freight;
    // The car can be loaded here: always in Practice; in Live only by someone who works its hub's dock.
    const freightPlayable = freight !== null && (!game.live || canLoadLive(app, freight.load));
    // Shelving likewise: in Live only by someone who may shelve here.
    const shelfLocked = game.live && !canShelveLive(app, feed);
    const car = useFreightCar(feed?.loads ?? null, scene, setToast, app, () => readRef.current());
    // One armload at a time: shelving jobs or freight, never both.
    const freightUnits = freight ? freightCarried(freight).units : 0;

    // The list: now, every 30 s, and when asked (after a Live put-up); merged into the running session.
    const feedRef = useRef<PlayFeed | null>(null);
    const read = useCallback(async () => {
        try {
            const next = await loadPlayFeed(app);
            feedRef.current = next;
            setFeed(next);
            setFailed(false);
            const current = getSession();
            setGame({ session: current ? refresh(current, next.jobs) : startPractice(next.jobs) });
        } catch (error) {
            console.warn("Play: could not load what there is to do.", error);
            setFailed(true);
        }
    }, [app]);
    const readRef = useRef(read);
    readRef.current = read;
    useEffect(() => {
        void read();
        const timer = window.setInterval(() => void read(), REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [read]);

    // Play reports every answer itself (with what happened to the boxes): the layout's flash toast stays quiet meanwhile (FlashToast).
    useEffect(() => {
        document.body.dataset.ownFlash = "play";
        return () => {
            delete document.body.dataset.ownFlash;
        };
    }, []);

    // Live is only for those who may: if the server stops saying so, back to Practice. Running out of
    // work is not that (the last shipment prepared leaves the list): only a job there that you may no longer do.
    const liveRevoked = feed !== null && !canShelveLive(app, feed) && (feed.store === null || (feed.loads.length > 0 && !feed.loads.some((l) => canLoadLive(app, l))));
    useEffect(() => {
        if (game.live && liveRevoked) setGame({ live: false });
    }, [game.live, liveRevoked]);

    // Light the zones worth going to: the floor while it has jobs, the shelf while you carry some;
    // the car's hub while the manifest needs more from it, the car while you carry freight (Practice only, for now).
    const floorJobs = session?.floor.length ?? 0;
    const carrying = session?.carrying.length ?? 0;
    const hubZone = freight && freightPlayable && freight.load.lines.some((l) => leftAt(freight, l.variantId) > 0) ? ZONE_OF[freight.load.origin] : null;
    useEffect(() => {
        const keys: ZoneKey[] = [];
        if (floorJobs > 0 && !shelfLocked) keys.push("floor");
        if (carrying > 0) keys.push("shelf");
        if (hubZone) keys.push(hubZone);
        if (freightUnits > 0) keys.push("truck");
        // Kept first: on the first render the scene may not be built yet, and it reads these when it is.
        kept.zones = keys;
        scene()?.showZones(keys);
    }, [floorJobs, carrying, hubZone, freightUnits, shelfLocked, scene, theme.palette.mode]);

    // Stepping onto the floor or into a hub opens its list; stepping off closes it.
    const zone = game.zone;
    const inHub = zone === "hub_a" || zone === "hub_b";
    useEffect(() => setPickerOpen(zone === "floor" || zone === "hub_a" || zone === "hub_b"), [zone]);

    /** The session is now `next`; the stack follows, new boxes flying in from `from`. */
    const apply = useCallback((next: PracticeState, from: ZoneKey | null) => {
        setGame({ session: next });
        kept.boxes = boxesToDraw(next);
        scene()?.setCarried(kept.boxes, from);
    }, [scene]);

    // Switching Practice ↔ Live starts again from the real list: practice moves must not look real, nor the other way round.
    const switchLive = useCallback((on: boolean) => {
        const load = getGame().freight?.load ?? feedRef.current?.loads[0];
        setGame({ live: on, session: startPractice(feedRef.current?.jobs ?? []), freight: load ? startLoading(load) : null });
        kept.boxes = [];
        scene()?.setCarried([], null);
        setToast(on
            ? { tone: "error", text: "Live: putting a job up on the shelf now shelves it for real." }
            : { tone: "info", text: "Practice: nothing you do is saved." });
    }, [scene]);
    const askLive = (on: boolean) => {
        if (!on) return switchLive(false);
        if (liveConfirmed.once) return switchLive(true);
        setAsking(true);
    };

    const take = (transferId: number) => {
        if (!session) return;
        if (freightUnits > 0) return setToast({ tone: "warning", text: "Your arms are full of freight. Load it into the car first." });
        const result = pickUp(session, transferId);
        if (result.ok) apply(result.state, "floor");
        else setToast({ tone: "warning", text: result.reason });
    };
    const takeAll = () => {
        if (!session) return;
        if (freightUnits > 0) return setToast({ tone: "warning", text: "Your arms are full of freight. Load it into the car first." });
        const { state, taken } = fill(session);
        if (taken === 0) setToast({ tone: "warning", text: "Nothing more fits. Put up what you carry first." });
        else apply(state, "floor");
    };
    const giveBack = (transferId: number) => {
        if (!session) return;
        const result = putBack(session, transferId);
        if (result.ok) apply(result.state, null);
    };

    const putUp = useCallback(async () => {
        const current = getSession();
        if (!current || current.carrying.length === 0 || getGame().saving) return;
        const target = scene();

        if (!getGame().live) {
            await target?.unloadAt("shelf");
            const { state, shelved } = shelveAll(current);
            setGame({ session: state });
            setToast({ tone: "success", text: `Shelved ${shelved.map((j) => j.reference).join(", ")}. Practice: nothing was saved.` });
            return;
        }

        // Live: up they go at once; the server answers job by job.
        setGame({ saving: true });
        const flying = target?.unloadAt("shelf");
        const done: number[] = [];
        const refused: Array<{ job: ShelveJob; message: string }> = [];
        for (const job of current.carrying) {
            const answer = await shelveLive(job);
            if (answer.ok) done.push(job.transferId);
            else refused.push({ job, message: answer.message });
        }
        await flying;

        const settled = shelveSome(current, done);
        setGame({ session: settled, saving: false });
        if (refused.length > 0) {
            // What the server refused comes back down into the worker's arms.
            kept.boxes = boxesToDraw(settled);
            scene()?.setCarried(kept.boxes, "shelf");
            const more = refused.length > 1 ? ` (and ${refused.length - 1} more refused)` : "";
            setToast({ tone: "error", text: `${refused[0].message}${more}${done.length > 0 ? ` · ${done.length} shelved.` : ""}` });
        } else {
            setToast({ tone: "success", text: `Shelved for real: ${current.carrying.map((j) => j.reference).join(", ")}.` });
        }
        void read();
    }, [scene, read]);

    // Freight: taken in a hub, loaded at the car; not while shelving jobs are in your arms.
    const takeFreight = (variantId: number, units: number) => {
        if (carrying > 0) return setToast({ tone: "warning", text: "Your arms are full of shelving jobs. Put them up first." });
        car.takeLine(variantId, units, zone ?? "hub_a");
    };
    const takeAllFreight = () => {
        if (carrying > 0) return setToast({ tone: "warning", text: "Your arms are full of shelving jobs. Put them up first." });
        car.takeAll(zone ?? "hub_a");
    };

    // E (or Space) does what the button says: open the list on the floor or in a hub, put up at the shelf, load at the car.
    const putUpRef = useRef(putUp);
    putUpRef.current = putUp;
    const loadRef = useRef(car.load);
    loadRef.current = car.load;
    const playableRef = useRef(freightPlayable);
    playableRef.current = freightPlayable;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest("[role=dialog]"))) return;
            if (event.code !== "KeyE" && event.code !== "Space") return;
            event.preventDefault();
            const here = getGame().zone;
            if (here === "shelf") void putUpRef.current();
            else if (here === "truck" && playableRef.current) void loadRef.current();
            else if (here === "floor" || here === "hub_a" || here === "hub_b") setPickerOpen((open) => !open);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // The armload: shelving jobs or freight units, whichever is in your arms.
    const shelfLoad = session ? load(session) : { cbm: 0, guessed: false, jobs: 0 };
    const freightLoad = freight ? freightCarried(freight) : { units: 0, cbm: 0, guessed: false };
    const carried = freightLoad.units > 0
        ? { cbm: freightLoad.cbm, guessed: freightLoad.guessed, text: `Carrying ${freightLoad.units} for ${freight!.load.reference}` }
        : { cbm: shelfLoad.cbm, guessed: shelfLoad.guessed, text: shelfLoad.jobs === 0 ? "Hands free" : `Carrying ${shelfLoad.jobs} ${shelfLoad.jobs === 1 ? "job" : "jobs"}` };
    const fullness = Math.min(1, carried.cbm / MAX_CBM);
    const goals = objectives(feed, session, freight, !freightPlayable, shelfLocked, failed);
    const showGauge = freight !== null && (inHub || zone === "truck" || freightUnits > 0);
    const walkTo = (key: ZoneKey) => {
        const [x, z] = zoneEntrance(key);
        scene()?.walkTo(x, z);
    };

    return (
        <>
            <Stack spacing={1} sx={{ alignItems: "center", pointerEvents: "none" }}>
                <GameHud canGoLive={liveAllowed || game.live} onLive={askLive} />
                {goals.map((goal) => (
                    <Button key={goal.text} onClick={goal.go ? () => walkTo(goal.go!) : undefined} disabled={!goal.go} variant="contained" color={goal.tone} size="small"
                        sx={{ pointerEvents: "auto", borderRadius: 999, fontWeight: 800, textTransform: "none", maxWidth: "100%", boxShadow: 3, "&.Mui-disabled": { bgcolor: glass, color: "text.secondary" } }}>
                        {goal.text}
                    </Button>
                ))}
            </Stack>

            <Box sx={{ flex: 1 }} />

            {/* Bottom: the picker at the floor, then what you carry and the button for where you stand. */}
            <Stack spacing={1} sx={{ alignItems: "center", pointerEvents: "none", width: "100%" }}>
                {pickerOpen && zone === "floor" && session && !shelfLocked && (
                    <Picker session={session} disabled={game.saving} onTake={take} onTakeAll={takeAll} onPutBack={giveBack} onClose={() => setPickerOpen(false)} />
                )}
                {pickerOpen && inHub && freight && freightPlayable && (
                    <HubPicker state={freight} hub={HUB_OF[zone as "hub_a" | "hub_b"]} disabled={game.saving} onTake={takeFreight} onTakeAll={takeAllFreight} onPutBack={car.putBack} onClose={() => setPickerOpen(false)} />
                )}
                {showGauge && <FreightGauge state={freight!} loads={feed?.loads ?? []} onChoose={car.choose} live={game.live} canLoad={canLoadLive(app, freight!.load)} saving={game.saving} onPrepare={() => void car.prepare()} />}
                <Paper elevation={0} sx={{ pointerEvents: "auto", px: 1.5, py: 1, borderRadius: 4, bgcolor: glass, boxShadow: 3, width: "100%", maxWidth: 420, border: game.live ? "2px solid" : "none", borderColor: "error.main" }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                                <Typography variant="caption" sx={{ fontWeight: 800 }} noWrap>{carried.text}</Typography>
                                <Tooltip title={carried.guessed ? "Some items have no size recorded; their size is a guess." : "What you carry, against an armload"}>
                                    <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary" }}>
                                        {formatCbm(carried.cbm)} / {formatCbm(MAX_CBM)} m³{carried.guessed ? " · size guessed" : ""}
                                    </Typography>
                                </Tooltip>
                            </Stack>
                            <LinearProgress variant="determinate" value={fullness * 100} color={fullness >= 1 ? "error" : fullness >= 0.8 ? "warning" : "primary"} sx={{ mt: 0.5, height: 8, borderRadius: 999 }} />
                        </Box>
                        {game.saving && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={18} />
                                <Typography variant="caption" sx={{ fontWeight: 800 }}>Saving…</Typography>
                            </Stack>
                        )}
                        {!game.saving && zone === "shelf" && carrying > 0 && (
                            <Button variant="contained" color={game.live ? "error" : "success"} onClick={() => void putUp()} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                {game.live ? "Shelve for real" : "Put up"} {carrying} · E
                            </Button>
                        )}
                        {!game.saving && ((zone === "floor" && !shelfLocked) || (inHub && freightPlayable)) && !pickerOpen && (
                            <Button variant="contained" onClick={() => setPickerOpen(true)} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                Pick up · E
                            </Button>
                        )}
                        {!game.saving && zone === "truck" && freightUnits > 0 && freightPlayable && (
                            <Button variant="contained" color={game.live ? "error" : "success"} onClick={() => void car.load()} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                {game.live ? "Load for real" : "Load"} {freightUnits} · E
                            </Button>
                        )}
                    </Stack>
                </Paper>
            </Stack>

            {/* Above the world (which sits at the modal layer itself). */}
            <Dialog open={asking} onClose={() => setAsking(false)} sx={{ zIndex: theme.zIndex.modal + 2 }}>
                <DialogTitle sx={{ fontWeight: 900 }}>Play for real?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        In Live, what you do here is done for real, exactly as the buttons on your own pages do it:
                    </Typography>
                    <Typography component="ul" variant="body2" sx={{ mb: 1, pl: 2.5 }}>
                        {canShelveLive(app, feed) && <li>putting a job up on the Store Shelf shelves it: the stock moves from the floor to the shelf;</li>}
                        {(feed?.loads ?? []).some((l) => canLoadLive(app, l)) && <li>loading the freight car picks the shipment: each line is ticked picked once all of it is in, and "Mark prepared" hands it to the courier.</li>}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Only do it for stock you have really moved. You can switch back to Practice at any time.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAsking(false)} sx={{ fontWeight: 800, textTransform: "none" }}>Stay in Practice</Button>
                    <Button variant="contained" color="error" sx={{ fontWeight: 800, textTransform: "none" }} onClick={() => {
                        liveConfirmed.once = true;
                        setAsking(false);
                        switchLive(true);
                    }}>Go Live</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={toast !== null} autoHideDuration={toast?.tone === "error" ? 7000 : 4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
                {toast ? <Alert severity={toast.tone} variant="filled" onClose={() => setToast(null)} sx={{ fontWeight: 700 }}>{toast.text}</Alert> : undefined}
            </Snackbar>
        </>
    );
}

type Goal = { text: string; tone: "primary" | "success" | "info"; go: ZoneKey | null };

/** What to do next, a line per job (shelving, the freight car), and where tapping each walks you. Carrying something, only its next step. */
function objectives(feed: PlayFeed | null, session: PracticeState | null, freight: FreightState | null, freightLocked: boolean, shelfLocked: boolean, failed: boolean): Goal[] {
    if (failed && !feed) return [{ text: "Could not load what there is to do. Trying again…", tone: "info", go: null }];
    if (!feed || !session) return [{ text: "Loading what there is to do…", tone: "info", go: null }];
    if (!feed.store) return [{ text: "Play covers the Main Store, and you work at another store: nothing to pick up here.", tone: "info", go: null }];
    if (freight && freightCarried(freight).units > 0) return [{ text: "Load it into the freight car at the platform →", tone: "success", go: "truck" }];
    const shelving: Goal = shelfLocked ? { text: "In Live you do not shelve here: you are not staff of this shop's shelf.", tone: "info", go: null } : objective(session, feed);
    if (session.carrying.length > 0 || !freight || freightLocked) return [shelving];
    const left = freight.load.lines.reduce((n, l) => n + leftAt(freight, l.variantId), 0);
    const car = freight.load.lines.reduce((n, l) => n + l.picked + (freight.loaded[l.variantId] ?? 0), 0);
    const of = freight.load.lines.reduce((n, l) => n + l.quantity, 0);
    const loading: Goal = left > 0
        ? { text: `${freight.load.reference}: ${car} / ${of} in the car, ${left} to fetch from ${freight.load.origin === "main_hub_a" ? "Hub A" : "Hub B"} →`, tone: "primary", go: ZONE_OF[freight.load.origin] }
        : { text: `${freight.load.reference} is fully loaded.`, tone: "success", go: null };
    return [shelving, loading];
}

/** The shelving job's next step. */
function objective(session: PracticeState, feed: PlayFeed): Goal {
    if (session.carrying.length > 0) return { text: `Put ${session.carrying.length === 1 ? "it" : "them"} up on the Store Shelf →`, tone: "success", go: "shelf" };
    if (session.floor.length > 0) {
        const urgent = session.floor.filter((j) => j.urgent).length;
        return { text: `${session.floor.length} to shelve from the Store Floor${urgent ? ` · ${urgent} urgent` : ""} →`, tone: "primary", go: "floor" };
    }
    if (session.shelved.length > 0) return { text: `All shelved: ${session.shelved.length} this session. Nice work.`, tone: "success", go: null };
    if (feed.needs.length > 0) return { text: `Nothing waiting on the floor. ${feed.needs.length} bins need stock from the Remote Hub or a shipment.`, tone: "info", go: null };
    return { text: "Nothing waiting on the shelving list right now.", tone: "info", go: null };
}

/** The Store Floor's list: take a job (whole), take as many as fit, or put one back. */
function Picker({ session, disabled, onTake, onTakeAll, onPutBack, onClose }: {
    session: PracticeState;
    disabled: boolean;
    onTake: (transferId: number) => void;
    onTakeAll: () => void;
    onPutBack: (transferId: number) => void;
    onClose: () => void;
}) {
    const jobs = useMemo(() => [...session.floor].sort((a, b) => Number(b.urgent) - Number(a.urgent)), [session.floor]);

    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", width: "100%", maxWidth: 420, maxHeight: "42dvh", display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }}>Store Floor: to shelve</Typography>
                <Button size="small" onClick={onTakeAll} disabled={disabled || jobs.length === 0} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Take what fits</Button>
                <IconButton size="small" onClick={onClose} aria-label="Close the list"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {session.carrying.map((job) => (
                    <JobRow key={`c${job.transferId}`} job={job} carried action={
                        <Button size="small" disabled={disabled} onClick={() => onPutBack(job.transferId)} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Put back</Button>
                    } />
                ))}
                {jobs.map((job) => {
                    const why = cannotPickUp(session, job.transferId);
                    return (
                        <JobRow key={job.transferId} job={job} action={
                            <Tooltip title={why ?? ""}>
                                <span>
                                    <Button size="small" variant="contained" disabled={disabled || why !== null} onClick={() => onTake(job.transferId)} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Take</Button>
                                </span>
                            </Tooltip>
                        } />
                    );
                })}
                {jobs.length === 0 && session.carrying.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Nothing waiting on the floor.</Typography>
                )}
            </Box>
        </Paper>
    );
}

function JobRow({ job, action, carried = false }: { job: ShelveJob; action: React.ReactNode; carried?: boolean }) {
    const size = jobCbm(job);
    return (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: carried ? "action.selected" : undefined }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{job.itemName}</Typography>
                <Typography variant="caption" color="text.secondary">
                    {job.display} · {formatCbm(size.cbm)} m³{size.guessed ? " (guessed)" : ""} · {job.reference}
                </Typography>
            </Box>
            {carried && <Chip size="small" label="Carrying" />}
            {job.urgent && !carried && <Chip size="small" color="error" label="Urgent" />}
            {action}
        </Stack>
    );
}
