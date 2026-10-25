import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Paper, Snackbar, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseRounded from "@mui/icons-material/CloseRounded";
import type { GuideApp } from "@/Components/Guide/chapters";
import { shelveLive } from "./actions";
import { carried as freightCarried, leftAt, startLoading, type FreightState } from "./freight";
import { FreightGauge, HUB_OF, HubPicker, ZONE_OF, useFreightCar } from "./FreightPanel";
import GameHud from "./GameHud";
import { ROLE_NAME, RemotePicker, RoleChip, useRelay } from "./RelayPanel";
import { roleNow, startRelay, type RelayState } from "./relay";
import type { GameScene } from "./GameScene";
import { getGame, kept, liveConfirmed, setGame, useGame } from "./gameStore";
import { canGoLive, canLegLive, stationsLive, canLoadLive, canRunLive, canShelveLive } from "./permissions";
import { startLegs } from "./legs";
import { DeskMenu, StationCards, deskGoals, deskZones, stationsAt, useStations } from "./StationPanel";
import { floorSite, shelfSite } from "./jobSites";
import { onStockDrawn } from "../shelfSpots";
import { LegCards, ZONES_OF_LEGS, legGoal, legZones, legsAt, useLegs } from "./LegPanel";
import { startRuns } from "./handoff";
import { RunCards, ZONES_OF_RUNS, runGoal, runZones, runsAt, useRuns } from "./RunPanel";
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
    // Remote Hub → Store goes through a courier; Practice only (in Live it waits for later).
    const relay = game.relay;
    const relayPlayable = relay !== null && !game.live;
    const handoff = useRelay(feed?.remote ?? null, scene, setToast);
    // The hand-off after Mark prepared: the courier's and the receiving dock's steps, at the platform and the doors.
    const runsHook = useRuns(app, feed?.runs ?? null, scene, setToast, () => readRef.current());
    // Transfers between sites: accept, claim, dispatch, hand over, receive (each person on their own app in Live).
    const legsHook = useLegs(app, feed?.legs ?? null, setToast, () => readRef.current());
    // The desks: every other module's work, listed with the actions the server offers this viewer.
    const desks = useStations(feed?.stations ?? null, setToast, () => readRef.current());
    const [runsOpen, setRunsOpen] = useState(true);
    const [deskMenu, setDeskMenu] = useState(false);
    /** How many hand-off cards (runs and transfer legs) wait at a zone. */
    const cardsAt = (key: ZoneKey | null) => runsAt(game.runs, key, game.live).length + legsAt(game.legs, key, game.live).length + stationsAt(feed?.stations ?? null, key, desks.struck).length;
    const relayCarrying = relay?.carrying.length ?? 0;
    const relayAtDoor = relay?.handedOver.length ?? 0;
    // One armload at a time, for one job: shelving, freight or the Remote Hub's stock.
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
    const liveRevoked = feed !== null && !canShelveLive(app, feed) && (feed.store === null || (feed.loads.length > 0 && !feed.loads.some((l) => canLoadLive(app, l))) && !feed.runs.some((r) => canRunLive(app, r)) && !feed.legs.some((l) => canLegLive(app, l)) && !stationsLive(feed));
    useEffect(() => {
        if (game.live && liveRevoked) setGame({ live: false });
    }, [game.live, liveRevoked]);

    // Light the zones worth going to: the floor while it has jobs, the shelf while you carry some;
    // the car's hub while the manifest needs more from it, the car while you carry freight (Practice only, for now).
    const floorJobs = session?.floor.length ?? 0;
    const carrying = session?.carrying.length ?? 0;
    const hubZone = freight && freightPlayable && freight.load.lines.some((l) => leftAt(freight, l.variantId) > 0) ? ZONE_OF[freight.load.origin] : null;
    // The relay's doors, as it goes: the hub while something waits, its door for the hub keeper, the shop's door for the courier and the receiver.
    const relayZones: ZoneKey[] | null = relay && relayPlayable ? [
        ...(relay.waiting.length > 0 && relay.carrier !== "courier" ? (["remote"] as ZoneKey[]) : []),
        ...(relay.carrier === "hub_keeper" ? (["remote_door"] as ZoneKey[]) : []),
        ...(relay.carrier !== null || relay.handedOver.length > 0 ? (["store_door"] as ZoneKey[]) : []),
    ] : null;
    useEffect(() => {
        const keys: ZoneKey[] = [];
        if (floorJobs > 0 && !shelfLocked) keys.push("floor");
        if (carrying > 0) keys.push("shelf");
        if (hubZone) keys.push(hubZone);
        if (freightUnits > 0) keys.push("truck");
        if (relayZones) keys.push(...relayZones);
        for (const key of [...runZones(game.runs, game.live), ...legZones(game.legs, game.live), ...deskZones(feed?.stations ?? null, desks.struck)]) if (!keys.includes(key)) keys.push(key);
        // Kept first: on the first render the scene may not be built yet, and it reads these when it is.
        kept.zones = keys;
        scene()?.showZones(keys);
    }, [floorJobs, carrying, hubZone, freightUnits, shelfLocked, relayZones?.join(), runZones(game.runs, game.live).join(), legZones(game.legs, game.live).join(), deskZones(feed?.stations ?? null, desks.struck).join(), scene, theme.palette.mode]);

    // The pick-up stands in front of the item's own stack on the floor, the put-up in front of its own slot on the racks: they follow
    // the first item of the jobs waiting / the jobs carried, and the stock as the world draws it again.
    const [stockTick, setStockTick] = useState(0);
    useEffect(() => onStockDrawn(() => setStockTick((n) => n + 1)), []);
    const floorItems = (session?.floor ?? []).map((j) => j.itemId ?? 0).filter(Boolean);
    const carriedItems = (session?.carrying ?? []).map((j) => j.itemId ?? 0).filter(Boolean);
    useEffect(() => {
        scene()?.setJobSites(floorSite(floorItems), shelfSite(carriedItems));
    }, [floorItems.join(), carriedItems.join(), stockTick, scene, theme.palette.mode]);

    /** Why your arms cannot take on `job` now (they hold another job's stock), or null. */
    const armsBusy = (job: "shelf" | "freight" | "relay"): string | null => {
        if (job !== "shelf" && carrying > 0) return "Your arms are full of shelving jobs. Put them up first.";
        if (job !== "freight" && freightUnits > 0) return "Your arms are full of freight. Load it into the car first.";
        if (job !== "relay" && relayCarrying > 0) return "Your arms are full of the Remote Hub's stock. Take it on to the shop first.";
        return null;
    };

    // Stepping onto the floor or into a hub opens its list; stepping off closes it.
    const zone = game.zone;
    const inHub = zone === "hub_a" || zone === "hub_b";
    useEffect(() => setRunsOpen(true), [zone]);
    useEffect(() => setPickerOpen(zone === "floor" || zone === "hub_a" || zone === "hub_b" || zone === "remote"), [zone]);

    /** The session is now `next`; the stack follows, new boxes flying in from `from`. */
    const apply = useCallback((next: PracticeState, from: ZoneKey | null) => {
        setGame({ session: next });
        kept.boxes = boxesToDraw(next);
        scene()?.setCarried(kept.boxes, from);
    }, [scene]);

    // Switching Practice ↔ Live starts again from the real list: practice moves must not look real, nor the other way round.
    const switchLive = useCallback((on: boolean) => {
        const load = getGame().freight?.load ?? feedRef.current?.loads[0];
        setGame({ live: on, session: startPractice(feedRef.current?.jobs ?? []), freight: load ? startLoading(load) : null, relay: startRelay(feedRef.current?.remote ?? []), runs: startRuns(feedRef.current?.runs ?? []), legs: startLegs(feedRef.current?.legs ?? []) });
        kept.boxes = [];
        scene()?.setCarried([], null);
        setToast(on
            ? { tone: "error", text: "Live: what you do now is done for real, as on your own pages." }
            : { tone: "info", text: "Practice: nothing you do is saved." });
    }, [scene]);
    const askLive = (on: boolean) => {
        if (!on) return switchLive(false);
        if (liveConfirmed.once) return switchLive(true);
        setAsking(true);
    };

    const take = (transferId: number) => {
        if (!session) return;
        const busy = armsBusy("shelf");
        if (busy) return setToast({ tone: "warning", text: busy });
        const result = pickUp(session, transferId);
        if (result.ok) apply(result.state, "floor");
        else setToast({ tone: "warning", text: result.reason });
    };
    const takeAll = () => {
        if (!session) return;
        const busy = armsBusy("shelf");
        if (busy) return setToast({ tone: "warning", text: busy });
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

    // Freight: taken in a hub, loaded at the car; not while another job's stock is in your arms.
    const takeFreight = (variantId: number, units: number) => {
        const busy = armsBusy("freight");
        if (busy) return setToast({ tone: "warning", text: busy });
        car.takeLine(variantId, units, zone ?? "hub_a");
    };
    const takeAllFreight = () => {
        const busy = armsBusy("freight");
        if (busy) return setToast({ tone: "warning", text: busy });
        car.takeAll(zone ?? "hub_a");
    };
    const takeRelay = (key: string) => {
        const busy = armsBusy("relay");
        if (busy) return setToast({ tone: "warning", text: busy });
        handoff.take(key);
    };

    // E (or Space) does what the button says: open the list on the floor or in a hub, put up at the shelf, load at the car.
    const cardsAtRef = useRef(cardsAt);
    cardsAtRef.current = cardsAt;
    const putUpRef = useRef(putUp);
    putUpRef.current = putUp;
    const loadRef = useRef(car.load);
    loadRef.current = car.load;
    const playableRef = useRef(freightPlayable);
    playableRef.current = freightPlayable;
    const handoffRef = useRef(handoff);
    handoffRef.current = handoff;
    const relayRef = useRef(relayPlayable);
    relayRef.current = relayPlayable;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest("[role=dialog]"))) return;
            if (event.code !== "KeyE" && event.code !== "Space") return;
            event.preventDefault();
            const here = getGame().zone;
            const waiting = (ZONES_OF_RUNS.includes(here as ZoneKey) || ZONES_OF_LEGS.includes(here as ZoneKey) || here?.startsWith("desk_") === true) && cardsAtRef.current(here) > 0;
            const relayBusy = (getGame().relay?.carrying.length ?? 0) > 0 || (getGame().relay?.handedOver.length ?? 0) > 0;
            const carryingFreight = (getGame().freight && freightCarried(getGame().freight!).units > 0) ?? false;
            if (waiting && !relayBusy && !carryingFreight) setRunsOpen((open) => !open);
            else if (here === "shelf") void putUpRef.current();
            else if (here === "truck" && playableRef.current) void loadRef.current();
            else if (here === "remote_door" && relayRef.current) void handoffRef.current.toCourier();
            else if (here === "store_door" && relayRef.current) {
                if ((getGame().relay?.carrying.length ?? 0) > 0) void handoffRef.current.atDoor();
                else handoffRef.current.receive();
            } else if (here === "floor" || here === "hub_a" || here === "hub_b" || here === "remote") setPickerOpen((open) => !open);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // The armload: whichever job's stock is in your arms.
    const shelfLoad = session ? load(session) : { cbm: 0, guessed: false, jobs: 0 };
    const freightLoad = freight ? freightCarried(freight) : { units: 0, cbm: 0, guessed: false };
    const relayRole = relay ? roleNow(relay) : null;
    const carried = freightLoad.units > 0
        ? { cbm: freightLoad.cbm, guessed: freightLoad.guessed, text: `Carrying ${freightLoad.units} for ${freight!.load.reference}` }
        : relayCarrying > 0
            ? { cbm: relay!.carrying.reduce((n, j) => n + j.unitCbm * Math.max(1, j.quantity), 0), guessed: relay!.carrying.some((j) => j.guessed), text: `Carrying ${relayCarrying} ${relayCarrying === 1 ? "job" : "jobs"} as ${ROLE_NAME[relay!.carrier!]}` }
            : { cbm: shelfLoad.cbm, guessed: shelfLoad.guessed, text: shelfLoad.jobs === 0 ? "Hands free" : `Carrying ${shelfLoad.jobs} ${shelfLoad.jobs === 1 ? "job" : "jobs"}` };
    const fullness = Math.min(1, carried.cbm / MAX_CBM);
    const runGoals = groupGoals(Object.values(game.runs ?? {}).map((r) => runGoal(r, game.live)), "shipments", game.live);
    const legGoals = groupGoals(Object.values(game.legs ?? {}).map((l) => legGoal(l, game.live)), "transfers", game.live);
    const stationGoals = deskGoals(feed?.stations ?? null, desks.struck).slice(0, 3);
    // The staff board on the office wall shows the board station.
    const boardStation = feed?.stations.find((s) => s.key === "board") ?? null;
    useEffect(() => scene()?.setBoard(feed ? boardStation : null), [boardStation, feed, scene, theme.palette.mode]);
    // The tables' screens and the shop's notice board say what the lists say.
    useEffect(() => scene()?.setStations(feed ? feed.stations : null, desks.struck), [feed, desks.struck, scene, theme.palette.mode]);
    useEffect(() => scene()?.setStoreBoard(feed ? {
        toShelve: feed.jobs.map((j) => `${j.display} · ${j.itemName}`),
        needs: feed.needs.map((n) => `${n.name} · ${n.display}`),
        toLoad: feed.loads.map((l) => `${l.reference}: ${l.lines.reduce((n, line) => n + line.picked, 0)} / ${l.lines.reduce((n, line) => n + line.quantity, 0)} picked`),
    } : null), [feed, scene, theme.palette.mode]);
    const goals = [...objectives(feed, session, freight, !freightPlayable, shelfLocked, relayPlayable ? relay : null, failed), ...runGoals.map((g) => ({ ...g, tone: "primary" as const })), ...legGoals.map((g) => ({ ...g, tone: "primary" as const })), ...stationGoals.map((g) => ({ ...g, tone: "primary" as const }))];
    const showGauge = freight !== null && (inHub || zone === "truck" || freightUnits > 0);
    const walkTo = (key: ZoneKey) => {
        const [x, z] = zoneEntrance(key);
        scene()?.walkTo(x, z);
    };

    return (
        <>
            <Stack spacing={1} sx={{ alignItems: "center", pointerEvents: "none" }}>
                <GameHud canGoLive={liveAllowed || game.live} onLive={askLive} />
                {/* The goals: one row to swipe, so they never bury the world (the site is big, and a desk has its own goal). */}
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", maxWidth: "calc(100vw - 16px)", overflowX: "auto", px: 0.5, pb: 0.5, scrollbarWidth: "none", pointerEvents: "auto" }}>
                    {(feed?.stations.length ?? 0) > 0 && (
                        <Button onClick={() => setDeskMenu((open) => !open)} variant="outlined" size="small" aria-expanded={deskMenu}
                            sx={{ pointerEvents: "auto", flexShrink: 0, borderRadius: 999, fontWeight: 800, textTransform: "none", bgcolor: glass, boxShadow: 3 }}>
                            Desks
                        </Button>
                    )}
                    {goals.map((goal) => (
                        <Button key={goal.text} onClick={goal.go ? () => walkTo(goal.go!) : undefined} disabled={!goal.go} variant="contained" color={goal.tone} size="small"
                            sx={{ pointerEvents: "auto", flexShrink: 0, borderRadius: 999, fontWeight: 800, textTransform: "none", maxWidth: { xs: "85vw", sm: "100%" }, boxShadow: 3, "&.Mui-disabled": { bgcolor: glass, color: "text.secondary" } }}>
                            {goal.text}
                        </Button>
                    ))}
                </Stack>
            </Stack>

            <Box sx={{ flex: 1 }} />

            {deskMenu && (
                <Box sx={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center", px: 1, pointerEvents: "none" }}>
                    <DeskMenu stations={feed?.stations ?? null} struck={desks.struck} onClose={() => setDeskMenu(false)} onWalk={(desk) => { setDeskMenu(false); walkTo(desk); }} />
                </Box>
            )}

            {/* Bottom: the picker at the floor, then what you carry and the button for where you stand. */}
            <Stack spacing={1} sx={{ alignItems: "center", pointerEvents: "none", width: "100%" }}>
                {pickerOpen && zone === "floor" && session && !shelfLocked && (
                    <Picker session={session} disabled={game.saving} onTake={take} onTakeAll={takeAll} onPutBack={giveBack} onClose={() => setPickerOpen(false)} />
                )}
                {pickerOpen && zone === "remote" && relay && relayPlayable && (
                    <RemotePicker state={relay} onTake={takeRelay} onPutBack={handoff.putBack} onClose={() => setPickerOpen(false)} />
                )}
                {relayPlayable && relayRole && <RoleChip role={relayRole} />}
                {runsOpen && zone && stationsAt(feed?.stations ?? null, zone, desks.struck).length > 0 && (
                    <StationCards stations={stationsAt(feed?.stations ?? null, zone, desks.struck)} struck={desks.struck} live={game.live} saving={game.saving} onPerform={desks.perform} onClose={() => setRunsOpen(false)} />
                )}
                {runsOpen && zone && legsAt(game.legs, zone, game.live).length > 0 && (
                    <LegCards legs={legsAt(game.legs, zone, game.live)} zone={zone} live={game.live} saving={game.saving}
                        onStep={(key, step) => void legsHook.perform(key, step)} onCount={legsHook.count} onClose={() => setRunsOpen(false)} />
                )}
                {runsOpen && zone && ZONES_OF_RUNS.includes(zone) && runsAt(game.runs, zone, game.live).length > 0 && (
                    <RunCards runs={runsAt(game.runs, zone, game.live)} zone={zone} live={game.live} saving={game.saving}
                        onStep={(id, step, signature) => void runsHook.perform(id, step, signature)} onCount={runsHook.count} onSaveCount={(id) => void runsHook.saveCount(id)} onClose={() => setRunsOpen(false)} />
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
                        {!game.saving && ((zone === "floor" && !shelfLocked) || (inHub && freightPlayable) || (zone === "remote" && relayPlayable)) && !pickerOpen && (
                            <Button variant="contained" onClick={() => setPickerOpen(true)} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                Pick up · E
                            </Button>
                        )}
                        {!game.saving && zone === "truck" && freightUnits > 0 && freightPlayable && (
                            <Button variant="contained" color={game.live ? "error" : "success"} onClick={() => void car.load()} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                {game.live ? "Load for real" : "Load"} {freightUnits} · E
                            </Button>
                        )}
                        {!game.saving && !runsOpen && zone && cardsAt(zone) > 0 && (
                            <Button variant="contained" color="secondary" onClick={() => setRunsOpen(true)} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                Hand-off · E
                            </Button>
                        )}
                        {relayPlayable && zone === "remote_door" && relay?.carrier === "hub_keeper" && (
                            <Button variant="contained" color="secondary" onClick={() => void handoff.toCourier()} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                Hand to the courier · E
                            </Button>
                        )}
                        {relayPlayable && zone === "store_door" && relayCarrying > 0 && (
                            <Button variant="contained" color="secondary" onClick={() => void handoff.atDoor()} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                Hand over · E
                            </Button>
                        )}
                        {relayPlayable && zone === "store_door" && relayCarrying === 0 && relayAtDoor > 0 && (
                            <Button variant="contained" color="success" onClick={handoff.receive} sx={{ borderRadius: 999, fontWeight: 900, textTransform: "none", whiteSpace: "nowrap" }}>
                                Check & receive {relayAtDoor} · E
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
                        {(feed?.runs ?? []).some((r) => canRunLive(app, r)) && <li>the courier's and the receiving dock's steps (check, sign, arrive, count) are taken for real, with your signature: signing hands the stock over or lands it.</li>}
                        {stationsLive(feed) && <li>the desks' actions (receiving, orders, counts, approvals …) are done for real, exactly as the same buttons on their own pages do them.</li>}
                        {(feed?.legs ?? []).some((l) => canLegLive(app, l)) && <li>your steps on transfers between sites (accept, claim, dispatch, hand over, receive or cancel) are taken for real; each person on the transfer does their own part.</li>}
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

            {/* A tap elsewhere does not close it: that tap is usually the next step, whose own message would be wiped. */}
            <Snackbar open={toast !== null} autoHideDuration={toast?.tone === "error" ? 7000 : 4000} onClose={(_, reason) => reason !== "clickaway" && setToast(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
                {toast ? <Alert severity={toast.tone} variant="filled" onClose={() => setToast(null)} sx={{ fontWeight: 700 }}>{toast.text}</Alert> : undefined}
            </Snackbar>
        </>
    );
}

/** One goal per zone: the step itself when one waits there, else a count (tap it to walk there). */
function groupGoals(goals: Array<{ text: string; go: ZoneKey } | null>, noun: string, live: boolean): Array<{ text: string; go: ZoneKey }> {
    const byZone = new Map<ZoneKey, string[]>();
    for (const goal of goals) if (goal) byZone.set(goal.go, [...(byZone.get(goal.go) ?? []), goal.text]);
    return [...byZone.entries()].slice(0, 3).map(([go, texts]) => ({ go, text: texts.length === 1 ? texts[0] : `${texts.length} ${noun} waiting for you${live ? " (for real)" : ""} here →` }));
}

type Goal = { text: string; tone: "primary" | "success" | "info"; go: ZoneKey | null };

/** What to do next, a line per job (shelving, the freight car, the Remote Hub), and where tapping each walks you. Mid-way through one, only its next step. */
function objectives(feed: PlayFeed | null, session: PracticeState | null, freight: FreightState | null, freightLocked: boolean, shelfLocked: boolean, relay: RelayState | null, failed: boolean): Goal[] {
    if (failed && !feed) return [{ text: "Could not load what there is to do. Trying again…", tone: "info", go: null }];
    if (!feed || !session) return [{ text: "Loading what there is to do…", tone: "info", go: null }];
    if (!feed.store) return [{ text: "Play covers the Main Store, and you work at another store: nothing to pick up here.", tone: "info", go: null }];
    if (freight && freightCarried(freight).units > 0) return [{ text: "Load it into the freight car at the platform →", tone: "success", go: "truck" }];
    const relaying = relay ? relayGoal(relay) : null;
    if (relay && (relay.carrying.length > 0 || relay.handedOver.length > 0)) return [relaying!];
    const shelving: Goal = shelfLocked ? { text: "In Live you do not shelve here: you are not staff of this shop's shelf.", tone: "info", go: null } : objective(session, feed);
    if (session.carrying.length > 0) return [shelving];
    const more = relaying && relay!.waiting.length > 0 ? [relaying] : [];
    if (!freight || freightLocked) return [shelving, ...more];
    const left = freight.load.lines.reduce((n, l) => n + leftAt(freight, l.variantId), 0);
    const car = freight.load.lines.reduce((n, l) => n + l.picked + (freight.loaded[l.variantId] ?? 0), 0);
    const of = freight.load.lines.reduce((n, l) => n + l.quantity, 0);
    const loading: Goal = left > 0
        ? { text: `${freight.load.reference}: ${car} / ${of} in the car, ${left} to fetch from ${freight.load.origin === "main_hub_a" ? "Hub A" : "Hub B"} →`, tone: "primary", go: ZONE_OF[freight.load.origin] }
        : { text: `${freight.load.reference} is fully loaded.`, tone: "success", go: null };
    return [shelving, loading, ...more];
}

/** The relay's next step, as whoever has it. */
function relayGoal(relay: RelayState): Goal {
    if (relay.carrier === "hub_keeper") return { text: "Hand it to the courier at the Remote Hub's door →", tone: "success", go: "remote_door" };
    if (relay.carrier === "courier") return { text: "As the courier: take it round to the shop's front door →", tone: "success", go: "store_door" };
    if (relay.handedOver.length > 0) return { text: "As the store's keeper: check and receive it at the shop door →", tone: "success", go: "store_door" };
    return { text: `${relay.waiting.length} waiting in the Remote Hub for a courier →`, tone: "primary", go: "remote" };
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
        <Paper elevation={0} sx={{ pointerEvents: "auto", width: "100%", maxWidth: 420, maxHeight: { xs: "34dvh", sm: "42dvh" }, display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
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
