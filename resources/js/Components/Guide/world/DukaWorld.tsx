import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, IconButton, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import CenterFocusStrongRounded from "@mui/icons-material/CenterFocusStrongRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import SportsEsportsRounded from "@mui/icons-material/SportsEsportsRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { identityFor } from "@/Components/Visual/identities";
import type { GuideApp } from "@/Components/Guide/chapters";
import EventLog from "./EventLog";
import JourneyCard from "./JourneyCard";
import PlaceCard from "./PlaceCard";
import SpotCard from "./SpotCard";
import ShipmentCard from "./ShipmentCard";
import Timeline, { PACE_MS, dayStart, isoDay, type Pace } from "./Timeline";
import { CARD_KINDS, KIND_COLOR, buildEvents, hhmm, lastBefore, type EventKind, type FeedEvent, type WorldEvent } from "./events";
import {
    COMPOUND, DROP, FLOOR_ZONES, HOUSES, HOUSE_SIZE, NEIGHBOUR, PALLET, PARKING, PLACES, PLATFORM_BERTH, ROADS, STORE, palletCentres,
    doorPosition, hubLayout, placeFor, vanRoute, type Place, type PlaceKey,
} from "./places";
import {
    ORDER_PHASE_LABEL, REFILL_PHASE_LABEL, orderStateAt, refillStateAt, stateAt,
    type WorldOrder, type WorldRefill, type WorldShipment,
} from "./replay";
import { RACKS, rackFace, spotAt, type RackWall } from "./storeLayout";
import { createGameScene, type GameScene } from "./game/GameScene";
import PlayLayer from "./game/PlayLayer";
import { player, setGame, useGame, type GameView, type PlayerPose } from "./game/gameStore";
import { openings } from "./game/siteBlockers";
import { roleFor, spawnFor } from "./game/spawn";

/**
 * Live Operations: the business as a working model, to scale (one unit is one
 * metre). The Main Hub compound from the site photo, its two hubs floored in
 * named 1 m cells, the platform between their doors, the Main Store with the
 * Remote Hub behind it, and the day replayed from real timestamps: vans for
 * shipments, parcels and couriers for orders, cartons carried to the shelf
 * for refills.
 *
 * The timeline is driven by events: every timestamp the day left is one
 * event (events.ts). Stepping to an event moves the clock to just after it,
 * so the vans drive the time in between, lights up where it happened and,
 * while the camera follows, flies there. Play walks the events one by one;
 * Live sits on the latest event and moves with the real clock.
 *
 * The scene is built once per colour mode; React state reaches it through the
 * small `api` the build hands back. Everything is disposed on unmount.
 */

/** The event the world lights up: where, and the words floating over it. */
interface Highlight {
    kind: EventKind;
    subject: number;
    where: PlaceKey | null;
    text: string;
    tone: string;
}

interface SceneApi {
    select: (key: PlaceKey | null) => void;
    home: () => void;
    setShipments: (shipments: WorldShipment[]) => void;
    setOrders: (orders: WorldOrder[]) => void;
    setRefills: (refills: WorldRefill[]) => void;
    setTime: (t: number) => void;
    /** Mark one spot of the racking ("f6"), or none. */
    setSpot: (code: string | null) => void;
    /** Stand inside the shop facing one wall of racking, as the seller does. */
    viewWall: (wall: RackWall) => void;
    /** Fly to the shop, the walls faded so you can see in. */
    viewStore: () => void;
    /** Light up an event; `fly` takes the camera there. */
    highlight: (h: Highlight | null, fly: boolean) => void;
    /** Play: put the worker in the world (game/PlayerController). Leaving puts the camera back. */
    enterPlay: (app: GuideApp, pose: PlayerPose, view: GameView) => void;
    exitPlay: () => void;
    setView: (view: GameView) => void;
    /** What Play's screen (game/PlayLayer) drives; null outside Play. */
    game: () => GameScene | null;
}

type Subject = { kind: EventKind; id: number };

const ALL_KINDS: EventKind[] = ["shipment", "transfer", "refill", "count", "order"];
const SITE_CENTER = new THREE.Vector3(-14, 0, 3);
const SITE_BOUNDS = new THREE.Box3(new THREE.Vector3(-95, 0, -16), new THREE.Vector3(69, 8, 26));

/** Where things wait on the store floor (west of the counter) and at the delivery bay, [x, z]. */
const FLOOR_SPOT: [number, number] = [STORE.position[0] - 0.9, STORE.position[1] - 0.8];
const BAY_SPOT: [number, number] = [36, 0.5];
/** A courier's ride from the delivery bay along the main road to the customers. */
const ORDER_RIDE: Array<[number, number]> = [BAY_SPOT, [37, -3], [44, -2], [52, 2], [58, 4], [60, 6.5]];
/** A refill carried from the Remote Hub's door, round the east side, in at the store's front door. */
const REMOTE_CARRY: Array<[number, number]> = [[23, -2.5], [24.5, -0.8], [29, 0.5], [29.5, 8], [28.5, 14], [20.6, 14.5], [20.6, 11.5]];

/** Story time per ms of animation when moving between events, and its bounds. */
const TWEEN_MIN_MS = 500;
const TWEEN_MAX_MS = 2400;

/** `?day=2026-10-14&event=shipment-12-signed`: a link to one moment of one day. */
function linkedMoment(): { day: string | null; event: string | null } {
    if (typeof window === "undefined") return { day: null, event: null };
    const params = new URLSearchParams(window.location.search);
    const day = params.get("day");
    const valid = day !== null && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= isoDay(new Date());
    return { day: valid ? day : null, event: valid ? params.get("event") : null };
}

export default function DukaWorld({ app, onOpenChapter, onClose }: { app: GuideApp; onOpenChapter: (key: string) => void; onClose: () => void }) {
    const theme = useTheme();
    const [linked] = useState(linkedMoment);
    const mountRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<SceneApi | null>(null);
    const [selected, setSelected] = useState<PlaceKey | null>(null);
    const [failed, setFailed] = useState(false);

    // What the day holds.
    const [day, setDay] = useState(() => linked.day ?? isoDay(new Date()));
    const [loadedDay, setLoadedDay] = useState<string | null>(null);
    const [shipments, setShipments] = useState<WorldShipment[]>([]);
    const [orders, setOrders] = useState<WorldOrder[]>([]);
    const [refills, setRefills] = useState<WorldRefill[]>([]);
    const [fed, setFed] = useState<FeedEvent[]>([]);
    const [busyDays, setBusyDays] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // The replay: the moment shown, the event it belongs to, and how we move.
    const [time, setTime] = useState(() => (linked.day && linked.day !== isoDay(new Date()) ? dayStart(linked.day) : Date.now()));
    const [cursor, setCursor] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [pace, setPace] = useState<Pace>("normal");
    const [live, setLive] = useState(() => !linked.day || linked.day === isoDay(new Date()));
    const [follow, setFollow] = useState(true);
    const [kinds, setKinds] = useState<EventKind[]>(ALL_KINDS);
    const [arrivals, setArrivals] = useState(0);

    // What is open: a bin, a shipment/order/refill, or a place; and the list.
    const [spot, setSpot] = useState<string | null>(null);
    const [wallView, setWallView] = useState<RackWall | null>(null);
    const [focused, setFocused] = useState<Subject | null>(null);
    const [logOpen, setLogOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);

    const isToday = day === isoDay(new Date());
    const start = dayStart(day);

    const allEvents = useMemo(() => buildEvents(shipments, orders, refills, fed), [shipments, orders, refills, fed]);
    const dayEvents = useMemo(() => allEvents.filter((e) => e.at >= start && e.at < start + 86_400_000), [allEvents, start]);
    const events = useMemo(() => dayEvents.filter((e) => kinds.includes(e.kind)), [dayEvents, kinds]);
    const counts = useMemo(() => {
        const c: Record<EventKind, number> = { shipment: 0, order: 0, refill: 0, transfer: 0, count: 0 };
        dayEvents.forEach((e) => c[e.kind]++);
        return c;
    }, [dayEvents]);
    const current: WorldEvent | null = cursor !== null ? events[cursor] ?? null : null;
    /** The last event that has happened by the moment shown: what the list and strip dim after. */
    const reached = useMemo(() => lastBefore(events, time), [events, time]);

    // Refs for the clock loop and the callbacks it runs.
    const timeRef = useRef(time);
    timeRef.current = time;
    const eventsRef = useRef(events);
    eventsRef.current = events;
    const liveRef = useRef(live);
    liveRef.current = live;
    const tween = useRef<{ from: number; to: number; start: number; ms: number } | null>(null);
    const reducedMotion = useMemo(() => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false), []);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;
        const built = buildWorld(mount, theme, (key) => {
            setFocused(null);
            setSpot(null);
            setWallView(null);
            setSelected(key);
        }, (code) => {
            setFocused(null);
            setSelected(null);
            setSpot(code);
        }, () => {
            setFollow(false);
            setWallView(null);
        }, (kind, id) => {
            setSelected(null);
            setSpot(null);
            setFocused({ kind, id });
        });
        if (!built) {
            setFailed(true);
            return;
        }
        apiRef.current = built.api;
        return () => {
            apiRef.current = null;
            built.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme.palette.mode]);

    useEffect(() => apiRef.current?.select(selected), [selected, theme.palette.mode]);
    useEffect(() => apiRef.current?.setShipments(shipments), [shipments, theme.palette.mode]);
    useEffect(() => apiRef.current?.setOrders(orders), [orders, theme.palette.mode]);
    useEffect(() => apiRef.current?.setRefills(refills), [refills, theme.palette.mode]);
    useEffect(() => apiRef.current?.setSpot(spot), [spot, theme.palette.mode]);
    useEffect(() => { if (wallView) apiRef.current?.viewWall(wallView); }, [wallView, theme.palette.mode]);
    useEffect(() => apiRef.current?.setTime(time), [time, shipments, orders, refills, theme.palette.mode]);

    // Play: the worker steps in (where they last stood, after a colour change), and out again.
    const game = useGame();
    const playing3d = game.mode === "play" && !failed;
    useEffect(() => {
        if (!playing3d) return;
        setSelected(null);
        setFocused(null);
        setSpot(null);
        setWallView(null);
        setPlaying(false);
        setFollow(false);
        apiRef.current?.enterPlay(app, player.pose ?? spawnFor(app), game.view);
        return () => apiRef.current?.exitPlay();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing3d, app, theme.palette.mode]);
    useEffect(() => apiRef.current?.setView(game.view), [game.view]);
    const gameScene = useCallback(() => apiRef.current?.game() ?? null, []);

    // Light up the current event; fly there while the camera follows.
    useEffect(() => {
        const tone = current ? (current.bad ? theme.palette.error.main : theme.palette[KIND_COLOR[current.kind]].main) : "";
        apiRef.current?.highlight(
            current ? { kind: current.kind, subject: current.subject, where: current.where, text: `${hhmm(current.at)} · ${current.what}`, tone } : null,
            follow && current !== null,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.key, follow, theme.palette.mode]);

    // An open shipment/order/refill card follows the event being shown.
    useEffect(() => {
        if (current) setFocused((f) => (f ? { kind: current.kind, id: current.subject } : f));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.key]);

    // Load the day; today's again every 30 s.
    const load = useCallback(async (which: string) => {
        setLoading(true);
        try {
            const url = route(`${app}.guide.world`, { from: which, to: which });
            const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as { shipments: WorldShipment[]; orders?: WorldOrder[]; refills?: WorldRefill[]; events?: FeedEvent[]; days: string[] };
            setShipments(data.shipments);
            setOrders(data.orders ?? []);
            setRefills(data.refills ?? []);
            setFed(data.events ?? []);
            setBusyDays(data.days);
            setLoadedDay(which);
        } catch (error) {
            console.warn("Live Operations: could not load the day.", error);
        } finally {
            setLoading(false);
        }
    }, [app]);

    useEffect(() => {
        void load(day);
    }, [day, load]);

    useEffect(() => {
        if (!isToday) return;
        const timer = window.setInterval(() => void load(day), 30_000);
        return () => window.clearInterval(timer);
    }, [isToday, day, load]);

    // Step to an event: the clock runs (quickly) to just after it.
    const goTo = useCallback((index: number) => {
        const event = eventsRef.current[index];
        if (!event) return;
        setLive(false);
        setCursor(index);
        const from = timeRef.current;
        const to = event.at + 1000;
        const ms = reducedMotion ? 0 : Math.max(TWEEN_MIN_MS, Math.min(TWEEN_MAX_MS, Math.abs(to - from) / 1000));
        if (ms === 0) {
            tween.current = null;
            setTime(to);
            setArrivals((a) => a + 1);
            return;
        }
        tween.current = { from, to, start: performance.now(), ms };
    }, [reducedMotion]);

    const goLive = useCallback(() => {
        tween.current = null;
        setDay(isoDay(new Date()));
        setLive(true);
        setPlaying(false);
        setTime(Date.now());
    }, []);

    // The clock: runs a step's tween, or follows the real clock while live.
    useEffect(() => {
        let frame = 0;
        let lastLive = 0;
        const loop = (now: number) => {
            const tw = tween.current;
            if (tw) {
                const k = Math.min(1, (now - tw.start) / tw.ms);
                const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                setTime(tw.from + (tw.to - tw.from) * eased);
                if (k >= 1) {
                    tween.current = null;
                    setArrivals((a) => a + 1);
                }
            } else if (liveRef.current && now - lastLive > 500) {
                lastLive = now;
                setTime(Date.now());
            }
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, []);

    // A link to one event: go there once its day has loaded.
    const pendingEvent = useRef(linked.event);
    useEffect(() => {
        const key = pendingEvent.current;
        if (!key || loadedDay !== day) return;
        pendingEvent.current = null;
        const index = events.findIndex((e) => e.key === key);
        if (index >= 0) goTo(index);
    }, [events, loadedDay, day, goTo]);

    // The address names the day and event on screen, so it can be shared; live needs neither.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (live && isToday) {
            url.searchParams.delete("day");
            url.searchParams.delete("event");
        } else {
            url.searchParams.set("day", day);
            if (current) url.searchParams.set("event", current.key);
            else url.searchParams.delete("event");
        }
        window.history.replaceState(window.history.state, "", url.toString());
    }, [live, isToday, day, current]);
    useEffect(() => () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("day");
        url.searchParams.delete("event");
        window.history.replaceState(window.history.state, "", url.toString());
    }, []);

    // Live sits on the latest event, and picks up new ones as they come in.
    useEffect(() => {
        if (!live) return;
        const latest = lastBefore(events, time);
        if (latest !== cursor) setCursor(latest);
    }, [live, events, time, cursor]);

    // Playing: hold each event, then step to the next; at the end, go live (today) or stop.
    useEffect(() => {
        if (!playing || tween.current || events.length === 0) return;
        const next = cursor === null ? 0 : cursor + 1;
        const timer = window.setTimeout(() => {
            if (next < events.length) goTo(next);
            else if (isToday) goLive();
            else setPlaying(false);
        }, cursor === null ? 400 : PACE_MS[pace]);
        return () => window.clearTimeout(timer);
    }, [playing, arrivals, cursor, pace, events.length, isToday, goTo, goLive]);

    const play = (on: boolean) => {
        // Play from live, or from the end, starts the day over.
        if (on && (live || cursor === events.length - 1)) {
            setTime(start);
            setCursor(null);
            setLive(false);
        }
        setPlaying(on);
    };

    const chooseDay = (next: string) => {
        tween.current = null;
        setFocused(null);
        setCursor(null);
        if (next === isoDay(new Date())) {
            goLive();
            return;
        }
        setDay(next);
        setLive(false);
        setTime(dayStart(next));
        setPlaying(true);
    };

    const chooseKinds = useCallback((next: EventKind[]) => {
        setKinds(next);
        // Stay at the same moment: on the last event of the new list before it.
        const list = dayEvents.filter((e) => next.includes(e.kind));
        setCursor(liveRef.current ? lastBefore(list, Date.now()) : lastBefore(list, timeRef.current));
    }, [dayEvents]);
    const closeLog = useCallback(() => setLogOpen(false), []);

    const jumpTo = (event: WorldEvent) => {
        let index = events.findIndex((e) => e.key === event.key);
        if (index < 0 && dayEvents.some((e) => e.key === event.key)) {
            // Filtered out: show its kind again, then go there.
            const list = dayEvents.filter((e) => kinds.includes(e.kind) || e.kind === event.kind);
            setKinds([...kinds, event.kind]);
            eventsRef.current = list;
            index = list.findIndex((e) => e.key === event.key);
        }
        if (index >= 0) goTo(index);
    };

    const openSubject = (event: WorldEvent) => {
        // Transfers and counts have no card: they light up their place on the timeline only.
        if (!CARD_KINDS.includes(event.kind)) return;
        setSelected(null);
        setSpot(null);
        setFocused({ kind: event.kind, id: event.subject });
    };

    const cursorRef = useRef(cursor);
    cursorRef.current = cursor;
    const playRef = useRef(() => {});
    playRef.current = () => play(!playing);
    const playRef3d = useRef(playing3d);
    playRef3d.current = playing3d;

    // Full screen: the page behind must not scroll. Escape closes; ← → step; space plays.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            // In Play the keys walk the worker; Escape steps back out to Watch.
            if (playRef3d.current) {
                if (event.key === "Escape") setGame({ mode: "watch" });
                return;
            }
            if (event.key === "Escape") onClose();
            else if (event.key === "ArrowRight") {
                event.preventDefault();
                const list = eventsRef.current;
                const at = liveRef.current ? lastBefore(list, Date.now()) : cursorRef.current;
                goTo(at === null ? 0 : Math.min(list.length - 1, at + 1));
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                const at = cursorRef.current;
                goTo(at === null ? 0 : Math.max(0, at - 1));
            } else if (event.key === " ") {
                event.preventDefault();
                playRef.current();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose, goTo]);

    const place = selected ? placeFor(selected) : null;
    const placeEvents = useMemo(
        () => (selected ? events.map((event, index) => ({ event, index })).filter(({ event }) => event.where === selected) : []),
        [events, selected],
    );
    const subjectEvents = useMemo(
        () => (focused ? allEvents.filter((e) => e.kind === focused.kind && e.subject === focused.id) : []),
        [allEvents, focused],
    );
    const focusedShipment = focused?.kind === "shipment" ? shipments.find((s) => s.id === focused.id) ?? null : null;
    const focusedOrder = focused?.kind === "order" ? orders.find((o) => o.id === focused.id) ?? null : null;
    const focusedRefill = focused?.kind === "refill" ? refills.find((r) => r.id === focused.id) ?? null : null;
    const glass = alpha(theme.palette.background.paper, 0.92);
    const currentKey = current?.key ?? null;

    let card: React.ReactNode = null;
    if (spot !== null) {
        card = <SpotCard code={spot} onClose={() => setSpot(null)} />;
    } else if (focusedShipment) {
        card = <ShipmentCard shipment={focusedShipment} time={time} events={subjectEvents} currentKey={currentKey} onEvent={jumpTo} onClose={() => setFocused(null)} />;
    } else if (focusedOrder) {
        const st = orderStateAt(focusedOrder, time);
        card = (
            <JourneyCard kind="order" reference={focusedOrder.reference} title={focusedOrder.delivery?.method === "store" ? "Collected at the counter" : "Delivered by courier"}
                phase={ORDER_PHASE_LABEL[st.phase]} chips={[`${focusedOrder.items} lines`, focusedOrder.total.toLocaleString(), `Payment ticks ${st.ticks}/2`]}
                events={subjectEvents} currentKey={currentKey} time={time} onEvent={jumpTo} onClose={() => setFocused(null)} />
        );
    } else if (focusedRefill) {
        const st = refillStateAt(focusedRefill, time);
        card = (
            <JourneyCard kind="refill" reference={focusedRefill.reference} title={`${focusedRefill.quantity} × ${focusedRefill.item ?? "item"}`}
                phase={REFILL_PHASE_LABEL[st.phase]} chips={[focusedRefill.source === "remote_hub" ? "From the Remote Hub" : focusedRefill.source === "shipment" ? "From a shipment" : "From the floor"]}
                events={subjectEvents} currentKey={currentKey} time={time} onEvent={jumpTo} onClose={() => setFocused(null)} />
        );
    } else if (place) {
        card = <PlaceCard place={place} onClose={() => { setSelected(null); setWallView(null); }} onOpenChapter={onOpenChapter} events={placeEvents} time={time} currentKey={currentKey} onEvent={goTo} />;
    }

    // On document.body: a layout's page transition leaves a transform on the
    // page wrapper, which would pin a fixed box inside it instead of the screen.
    // (createPortal, not MUI's Portal: that mounts a render late, after the scene looked for its mount.)
    return createPortal(
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                height: "100dvh",
                zIndex: theme.zIndex.modal,
                overflow: "hidden",
                background: `linear-gradient(180deg, ${alpha(theme.palette.info.main, theme.palette.mode === "dark" ? 0.18 : 0.12)} 0%, ${theme.palette.background.default} 100%)`,
                touchAction: "none",
                "& .world-label": {
                    px: { xs: 0.75, sm: 1 },
                    py: 0.25,
                    borderRadius: 999,
                    fontFamily: theme.typography.fontFamily,
                    fontWeight: 800,
                    fontSize: { xs: "0.68rem", sm: "0.75rem" },
                    whiteSpace: "nowrap",
                    bgcolor: glass,
                    color: "text.primary",
                    border: "2px solid",
                    borderColor: "var(--tone)",
                    boxShadow: 2,
                    cursor: "pointer",
                    pointerEvents: "auto",
                    userSelect: "none",
                    transition: "transform .15s, opacity .2s",
                    "&:hover, &.is-selected": { transform: "scale(1.08)", bgcolor: "var(--tone)", color: "common.white" },
                    "&.is-covered": { opacity: 0, pointerEvents: "none" },
                },
                "& .world-label--fixed": {
                    fontSize: { xs: "0.6rem", sm: "0.68rem" },
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    borderColor: "divider",
                    color: "text.secondary",
                    boxShadow: 0,
                    cursor: "default",
                    pointerEvents: "none",
                    "&:hover": { transform: "none", bgcolor: glass, color: "text.secondary" },
                },
                // Small signs: a shipment collecting its ticks, a bin waiting for its refill.
                "& .world-badge": {
                    px: 0.75,
                    borderRadius: 999,
                    fontFamily: theme.typography.fontFamily,
                    fontWeight: 800,
                    fontSize: "0.65rem",
                    whiteSpace: "nowrap",
                    bgcolor: "warning.main",
                    color: "warning.contrastText",
                    boxShadow: 2,
                    pointerEvents: "none",
                },
                "& .world-badge--refill": { bgcolor: "info.main", color: "info.contrastText" },
                // Play's job zones (game/zones.ts): a sign over each, brighter where the worker stands.
                "& .world-badge--zone": { bgcolor: glass, color: "text.primary", border: "2px solid", borderColor: "divider", fontSize: "0.7rem", "&.is-active": { bgcolor: "primary.main", color: "primary.contrastText", borderColor: "primary.main" } },
                // What just happened, floating over where it happened.
                "& .world-callout > div": {
                    maxWidth: { xs: 200, sm: 280 },
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 2,
                    fontFamily: theme.typography.fontFamily,
                    fontWeight: 800,
                    fontSize: { xs: "0.72rem", sm: "0.8rem" },
                    lineHeight: 1.25,
                    textAlign: "center",
                    bgcolor: "var(--tone)",
                    color: "common.white",
                    boxShadow: 6,
                    pointerEvents: "none",
                    "@media (prefers-reduced-motion: no-preference)": { animation: "world-callout-in .35s ease-out both" },
                },
                // Play's touch stick (game/PlayerController): a ring under the thumb, and its knob.
                "& .world-stick": {
                    position: "absolute",
                    left: -48,
                    top: -48,
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    border: "3px solid",
                    borderColor: alpha(theme.palette.text.primary, 0.35),
                    bgcolor: alpha(theme.palette.background.paper, 0.35),
                    pointerEvents: "none",
                    opacity: 0,
                    transition: "opacity .12s",
                    "&.is-on": { opacity: 1 },
                },
                "& .world-stick-knob": {
                    position: "absolute",
                    left: 26,
                    top: 26,
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    boxShadow: 3,
                },
                "@keyframes world-callout-in": { from: { opacity: 0, transform: "translateY(8px) scale(.92)" }, to: { opacity: 1, transform: "none" } },
            }}
        >
            <Box ref={mountRef} sx={{ position: "absolute", inset: 0 }} />

            {failed && (
                <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 3 }}>
                    <Paper elevation={0} sx={{ p: 4, borderRadius: 5, border: "1px solid", borderColor: "divider", textAlign: "center", maxWidth: 420 }}>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>This device can't draw the 3D world.</Typography>
                        <Typography color="text.secondary" sx={{ mb: 2 }}>Its browser has 3D graphics (WebGL) turned off.</Typography>
                        <Button variant="contained" onClick={onClose} sx={{ borderRadius: 999, fontWeight: 800 }}>Back</Button>
                    </Paper>
                </Box>
            )}

            {/* The overlay: top bar; the list and the open card; the timeline. */}
            <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 1, p: 1, pt: "max(8px, env(safe-area-inset-top))", pb: "max(8px, env(safe-area-inset-bottom))", pointerEvents: "none" }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton onClick={onClose} aria-label="Close" sx={{ pointerEvents: "auto", bgcolor: glass, boxShadow: 2, "&:hover": { bgcolor: "background.paper" } }}>
                        <CloseRounded />
                    </IconButton>
                    <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 900, fontSize: { xs: "1rem", sm: "1.15rem" }, textShadow: `0 1px 0 ${theme.palette.background.paper}` }} noWrap>
                        Live Operations
                    </Typography>
                    {!failed && (
                        <Button onClick={() => setGame({ mode: playing3d ? "watch" : "play" })} aria-label={playing3d ? "Back to watching" : "Play as a worker"} startIcon={playing3d ? <VisibilityRounded /> : <SportsEsportsRounded />}
                            sx={{ pointerEvents: "auto", borderRadius: 999, fontWeight: 800, textTransform: "none", bgcolor: glass, boxShadow: 2, color: "text.primary", "&:hover": { bgcolor: "background.paper" } }}>
                            {playing3d ? "Watch" : "Play"}
                        </Button>
                    )}
                    {!playing3d && <IconButton onClick={() => { setSelected(null); setFocused(null); setFollow(false); setWallView(null); apiRef.current?.home(); }} aria-label="See the whole site" title="See the whole site"
                        sx={{ pointerEvents: "auto", bgcolor: glass, boxShadow: 2, "&:hover": { bgcolor: "background.paper" } }}>
                        <CenterFocusStrongRounded />
                    </IconButton>}
                </Stack>

                {playing3d && <PlayLayer app={app} scene={gameScene} />}

                {/* In the shop: look at each wall of racks from where the seller stands. */}
                {!playing3d && (wallView !== null || selected === "store_shelf" || selected === "store_floor" || selected === "store_counter") && (
                    <Box sx={{ position: "absolute", top: { xs: 60, sm: 10 }, left: { xs: 8, sm: 230 }, maxWidth: "calc(100% - 16px)", flexWrap: "wrap", pointerEvents: "auto", display: "flex", alignItems: "center", gap: 1, p: 0.5, borderRadius: 999, bgcolor: glass, boxShadow: 3 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, pl: 1, display: { xs: "none", md: "block" } }}>See the racks from the seller's side</Typography>
                        <ToggleButtonGroup size="small" exclusive value={wallView} onChange={(_, next: RackWall | null) => next && setWallView(next)} aria-label="Wall of racks">
                            {RACKS.map((run) => (
                                <ToggleButton key={run.wall} value={run.wall} sx={{ fontWeight: 800, px: 1.25, textTransform: "none" }} title={`${run.label}: ${run.columns[0]}–${run.columns[run.columns.length - 1]}`}>
                                    {{ west: "Left", north: "Back", east: "Right", south: "Front" }[run.wall]} · {run.columns[0]}–{run.columns[run.columns.length - 1]}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <Button size="small" onClick={() => { setWallView(null); apiRef.current?.viewStore(); }} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Whole shop</Button>
                    </Box>
                )}

                {/* Play hides the replay: the list, the cards and the timeline. */}
                {!playing3d && <Box sx={{ flex: 1, minHeight: 0, display: "flex", gap: 1, alignItems: { xs: "flex-end", sm: "stretch" } }}>
                    {logOpen && (
                        <Box sx={{ pointerEvents: "auto", width: { xs: "100%", sm: 340 }, height: { xs: "45dvh", sm: "auto" }, display: card ? { xs: "none", sm: "flex" } : "flex", flexDirection: "column", minHeight: 0 }}>
                            <EventLog events={events} counts={counts} kinds={kinds} onKinds={chooseKinds} cursor={cursor} reached={reached} onCursor={goTo} onClose={closeLog} />
                        </Box>
                    )}
                    <Box sx={{ flex: 1, display: { xs: logOpen && !card ? "none" : "block", sm: "block" } }} />
                    {card && (
                        <Box sx={{ pointerEvents: "auto", width: { xs: "100%", sm: 360 }, maxHeight: { xs: "40dvh", sm: "100%" }, alignSelf: "flex-end", display: "flex", minHeight: 0 }}>
                            {card}
                        </Box>
                    )}
                </Box>}

                {!playing3d && <Box sx={{ pointerEvents: "auto" }}>
                    <Timeline
                        day={day}
                        onDay={chooseDay}
                        busyDays={busyDays}
                        loading={loading}
                        events={events}
                        cursor={cursor}
                        onCursor={goTo}
                        time={time}
                        reached={reached}
                        playing={playing}
                        onPlaying={play}
                        pace={pace}
                        onPace={setPace}
                        live={live && isToday}
                        isToday={isToday}
                        onLive={goLive}
                        follow={follow}
                        onFollow={setFollow}
                        logOpen={logOpen}
                        onLog={setLogOpen}
                        onDetails={openSubject}
                    />
                </Box>}
            </Box>
        </Box>,
        document.body,
    );
}

/* ------------------------------------------------------------------------ */
/* The scene                                                                 */
/* ------------------------------------------------------------------------ */

interface PlaceNode {
    place: Place;
    group: THREE.Group;
    pad: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    label: HTMLDivElement;
    tone: THREE.Color;
}

/** A pair of swing leaves; `open` (0–1) eases towards `target` each frame. */
interface Swing {
    leaves: Array<{ pivot: THREE.Object3D; closed: number; opened: number }>;
    open: number;
    target: number;
}

interface VanRig {
    van: THREE.Group;
    cartons: THREE.Mesh[];
    badge: CSS2DObject;
    badgeEl: HTMLDivElement;
}

function buildWorld(
    mount: HTMLDivElement,
    theme: Theme,
    onSelect: (key: PlaceKey | null) => void,
    onSpot: (code: string) => void,
    onUserMove: () => void,
    onSubject: (kind: EventKind, id: number) => void,
): { api: SceneApi; dispose: () => void } | null {
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
        console.warn("Live Operations: WebGL unavailable.", error);
        return null;
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dark = theme.palette.mode === "dark";
    const color = (value: string) => new THREE.Color(value);
    const toneOf = (key: string) => color(theme.palette[identityFor(key).color].main);

    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 600;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width, height);
    labels.domElement.style.position = "absolute";
    labels.domElement.style.inset = "0";
    labels.domElement.style.pointerEvents = "none";
    mount.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 900);
    let home = homeView(width / height);
    camera.position.copy(home.camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(home.target);
    controls.minDistance = 6;
    controls.maxDistance = Math.max(260, home.distance * 1.5);
    controls.maxPolarAngle = 1.35;
    controls.screenSpacePanning = false;
    let userMoved = false;
    // Only a person's drag fires "start"; our own flights don't.
    controls.addEventListener("start", () => {
        userMoved = true;
        onUserMove();
    });

    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x202830 : 0xb9c4b0, dark ? 1.3 : 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.4 : 2.2);
    sun.position.set(-40, 90, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -110, right: 90, top: 50, bottom: -50, near: 1, far: 280 });
    scene.add(sun);

    const groundTone = color(theme.palette.background.paper).lerp(color(theme.palette.success.main), dark ? 0.18 : 0.28);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(180, 1, 72), new THREE.MeshStandardMaterial({ color: groundTone, roughness: 1 }));
    ground.position.set(-14, -0.5, 3);
    ground.receiveShadow = true;
    scene.add(ground);

    const wallTone = color(theme.palette.background.paper).lerp(color(theme.palette.text.primary), dark ? 0.12 : 0.06);
    const padTone = color(theme.palette.background.paper).lerp(color(theme.palette.text.primary), 0.1);
    const darkTone = color(theme.palette.text.primary).lerp(wallTone, 0.4);
    const asphalt = color(theme.palette.text.primary).lerp(color(theme.palette.background.paper), dark ? 0.55 : 0.62);
    const keeperTone = toneOf("stock_keeper");
    const driverTone = toneOf("delivery");

    // Scenery: the compound with its gate, the neighbour, the road, the store's shell.
    const gate = addCompound(scene, wallTone, darkTone, padTone);
    scene.add(mesh(new THREE.BoxGeometry(NEIGHBOUR.size[0], NEIGHBOUR.height, NEIGHBOUR.size[1]), wallTone.clone().lerp(darkTone, 0.35), NEIGHBOUR.position[0], NEIGHBOUR.height / 2, NEIGHBOUR.position[1]));
    addRoads(scene, asphalt);
    const store = addStoreShell(scene, wallTone, toneOf("seller"), padTone);
    const shelfFaces: ShelfFace[] = [];
    /** The racks' steel, shared so pressing Store Shelf can tint it all at once. */
    let steel: THREE.MeshStandardMaterial | null = null;
    const steelBase = new THREE.Color();
    const fixedLabels = [
        fixedLabel(COMPOUND.label, -62, 3, -15),
        fixedLabel(STORE.label, STORE.position[0], STORE.wall + 2.5, STORE.position[1] - STORE.size[1] / 2),
    ];
    fixedLabels.forEach((label) => scene.add(label.object));

    // Places.
    const nodes = new Map<PlaceKey, PlaceNode>();
    const doors = new Map<PlaceKey, Swing>();
    const roofs: THREE.Object3D[] = [];
    const pickables: THREE.Object3D[] = [];
    // The shop's floor is the Store Floor: tapping it selects that place.
    store.floor.userData.placeKey = "store_floor";
    pickables.push(store.floor);
    const people: Array<{ mesh: THREE.Object3D; phase: number; base: number }> = [];

    for (const place of PLACES) {
        const tone = toneOf(place.roles[0]);
        const [w, d] = place.size;
        const group = new THREE.Group();
        group.position.set(place.position[0], 0, place.position[1]);

        const outdoorPad = place.shape !== "hub" && place.shape !== "platform" && !place.indoor;
        const pad = new THREE.Mesh(new THREE.BoxGeometry(w + (outdoorPad ? 2 : 0), 0.12, d + (outdoorPad ? 2 : 0)), new THREE.MeshStandardMaterial({ color: padTone, roughness: 0.9 }));
        pad.position.y = place.indoor ? 0.13 : 0.07;
        pad.receiveShadow = true;
        // The shelf and the floor wrap the whole room; their places are marked by their own meshes.
        pad.visible = place.shape !== "shelves" && place.shape !== "floor";
        group.add(pad);

        if (place.shape === "hub") {
            const built = makeHub(place, tone, wallTone, darkTone, padTone);
            group.add(built.group);
            roofs.push(built.roof);
            if (built.swing) doors.set(place.key, built.swing);
        } else if (place.shape === "shelves") {
            const built = makeShelves(wallTone, darkTone);
            group.add(built.group);
            shelfFaces.push(...built.faces);
            steel = built.steel;
            steelBase.copy(built.steel.color);
        } else {
            group.add(makeBuilding(place, toneOf(place.shape === "platform" ? "store_manager" : place.roles[0]), wallTone, darkTone));
        }

        const door = doorPosition(place);
        place.roles.forEach((role, index) => {
            const person = makePerson(toneOf(role));
            const spread = (index - (place.roles.length - 1) / 2) * 1.2;
            const base = place.indoor ? 0.19 : 0.12;
            if (place.shape === "hub" && door) {
                // Stock keepers stand just outside their hub's door.
                const [ox, oz] = door.out;
                person.position.set(door.at[0] - place.position[0] + ox * 1.8 + oz * (spread + 2), base, door.at[1] - place.position[1] + oz * 1.8 + ox * (spread + 2));
            } else if (place.shape === "platform") {
                person.position.set(spread, base + 0.3, d / 2 - 0.6);
            } else if (place.shape === "shelves") {
                // In front of the back shelves (their front edge is 2.5 m north of the middle), east of the pallets.
                person.position.set(1.5 + spread, base, -1.9);
            } else if (place.shape === "floor") {
                person.position.set(-0.8, base, -2 + index * 0.9);
            } else if (place.shape === "counter") {
                // The counter stands against the east wall: the seller at its back end, the customer facing it from the shop floor.
                person.position.set(index === 0 ? -0.8 : -1.6, base, index === 0 ? -0.9 : 0.6);
            } else {
                person.position.set(spread, base, place.indoor ? d / 2 - 1 : d / 2 + 2);
            }
            group.add(person);
            people.push({ mesh: person, phase: Math.random() * Math.PI * 2, base: person.position.y });
        });

        group.traverse((object) => {
            object.userData.placeKey = place.key;
            if ((object as THREE.Mesh).isMesh) {
                if (object !== pad) object.castShadow = true;
                pickables.push(object);
            }
        });

        const label = document.createElement("div");
        label.className = "world-label";
        label.textContent = place.label;
        label.style.setProperty("--tone", `#${tone.getHexString()}`);
        label.addEventListener("pointerdown", (event) => event.stopPropagation());
        label.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelect(place.key);
        });
        const labelObject = new CSS2DObject(label);
        if (place.labelAt) labelObject.position.set(...place.labelAt);
        else labelObject.position.set(0, labelHeight(place), 0);
        group.add(labelObject);

        scene.add(group);
        nodes.set(place.key, { place, group, pad, label, tone });
    }

    /** Vans, parcels, couriers and cartons: a tap opens the shipment, order or refill they carry. */
    const tappable = (object: THREE.Object3D, kind: EventKind, id: number) => {
        object.traverse((o) => {
            o.userData.subject = { kind, id };
            if ((o as THREE.Mesh).isMesh) pickables.push(o);
        });
    };
    const untappable = (...objects: THREE.Object3D[]) => {
        const gone = new Set<THREE.Object3D>();
        objects.forEach((object) => object.traverse((o) => gone.add(o)));
        for (let i = pickables.length - 1; i >= 0; i--) if (gone.has(pickables[i])) pickables.splice(i, 1);
    };

    // Vans, one per shipment, made on first sight; and the routes they drive.
    const routes = new Map<PlaceKey, THREE.CatmullRomCurve3>();
    const routeFor = (destination: PlaceKey) => {
        let curve = routes.get(destination);
        if (!curve) {
            curve = new THREE.CatmullRomCurve3(vanRoute(destination).map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "catmullrom", 0.2);
            routes.set(destination, curve);
        }
        return curve;
    };
    const rigs = new Map<number, VanRig>();
    const cartonMaterial = new THREE.MeshStandardMaterial({ color: keeperTone.clone().lerp(new THREE.Color(0x8b5a2b), 0.6), roughness: 0.8, flatShading: true });
    const cartonGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const rigFor = (s: WorldShipment): VanRig => {
        const existing = rigs.get(s.id);
        if (existing) return existing;
        const van = makeVan(driverTone, wallTone, darkTone);
        van.visible = false;
        scene.add(van);
        const cartons: THREE.Mesh[] = [];
        const count = Math.min(8, Math.max(2, Math.ceil(s.cbm || s.items || 2)));
        for (let i = 0; i < count; i++) {
            const c = new THREE.Mesh(cartonGeometry, cartonMaterial);
            c.castShadow = true;
            c.visible = false;
            scene.add(c);
            cartons.push(c);
        }
        const badgeEl = document.createElement("div");
        badgeEl.className = "world-badge";
        const badge = new CSS2DObject(badgeEl);
        badge.visible = false;
        scene.add(badge);
        const rig = { van, cartons, badge, badgeEl };
        [van, ...cartons].forEach((o) => tappable(o, "shipment", s.id));
        rigs.set(s.id, rig);
        return rig;
    };

    let shipments: WorldShipment[] = [];
    let now = Date.now();
    /** The camera went to an event, so deselecting a place should not fly home. */
    let awayFromHome = false;
    const platformAt = placeFor("platform").position;

    const placeShipments = () => {
        // Two shipments at the same spot stand side by side.
        const slots = new Map<string, number>();
        const slot = (key: string) => {
            const n = slots.get(key) ?? 0;
            slots.set(key, n + 1);
            return n;
        };
        const openDoors = new Set<PlaceKey>();
        let gateWanted = false;

        for (const s of shipments) {
            const rig = rigFor(s);
            rig.van.visible = false;
            rig.badge.visible = false;
            rig.cartons.forEach((c) => (c.visible = false));

            const origin = s.origin.place;
            const destination = s.destination.place;
            if (!origin || !destination) continue;

            const st = stateAt(s, now);
            const door = doorPosition(placeFor(origin));
            const stack = (x: number, z: number, count = rig.cartons.length) => {
                rig.cartons.forEach((c, i) => {
                    if (i >= count) return;
                    c.visible = true;
                    c.position.set(x + (i % 2) * 0.85 - 0.42, 0.45 + Math.floor(i / 4) * 0.62, z + (Math.floor(i / 2) % 2) * 0.85 - 0.42);
                });
            };

            switch (st.phase) {
                case "ticking":
                    if (door) {
                        rig.badge.visible = true;
                        rig.badgeEl.textContent = `${s.reference} · ${st.ticks}/4 ticks`;
                        rig.badge.position.set(door.at[0] + door.out[0] * 2, 4.5 + slot(`badge-${origin}`) * 0.9, door.at[1] + door.out[1] * 2);
                    }
                    break;
                case "picking":
                    openDoors.add(origin);
                    if (door) {
                        // In the walkway, just inside the door.
                        const n = slot(`pick-${origin}`);
                        stack(door.at[0] - door.out[0] * (2 + n * 2), door.at[1] - door.out[1] * (2 + n * 2));
                    }
                    break;
                case "prepared": {
                    openDoors.add(origin);
                    const n = slot("platform");
                    stack(platformAt[0] - 0.9 + (n % 2) * 1.8, platformAt[1] - 0.9 + (Math.floor(n / 2) % 2) * 1.8);
                    break;
                }
                case "loading": {
                    const n = slot("berth");
                    stack(platformAt[0] + 0.9, platformAt[1] - 0.9 + n * 1.8, Math.round(rig.cartons.length * (1 - st.progress)));
                    rig.van.visible = true;
                    // Back doors to the platform, nose to the gate.
                    rig.van.position.set(PLATFORM_BERTH[0], 0, PLATFORM_BERTH[1] + n * 2.6);
                    rig.van.rotation.y = 0;
                    break;
                }
                case "driving": {
                    const curve = routeFor(destination);
                    const u = Math.min(0.999, Math.max(0.001, st.progress));
                    const at = curve.getPointAt(u);
                    const tangent = curve.getTangentAt(u);
                    rig.van.visible = true;
                    rig.van.position.set(at.x, 0, at.z);
                    rig.van.rotation.y = Math.atan2(-tangent.z, tangent.x);
                    if (Math.hypot(at.x - COMPOUND.gate.at[0], at.z - COMPOUND.gate.at[1]) < 14) gateWanted = true;
                    break;
                }
                case "arrived": {
                    const stop = PARKING[destination];
                    if (!stop) break;
                    const n = slot(`park-${destination}`);
                    rig.van.visible = true;
                    rig.van.position.set(stop[0] - n * 6, 0, stop[1]);
                    rig.van.rotation.y = 0;
                    // Unloaded at the goods door it goes in by.
                    if (destination === "store_floor") {
                        // Unloaded inside the shop, on the floor clear of the pallets, the counter and the door; a third waiting is not drawn.
                        const [sx, sz] = STORE.position;
                        const spots: Array<[number, number]> = [[sx + 1.65, sz - 1.6], [sx + 1.65, sz + 1.9]];
                        if (spots[n]) stack(spots[n][0], spots[n][1]);
                        break;
                    }
                    const drop = DROP[destination] ?? stop;
                    stack(drop[0] - n * 2, drop[1]);
                    break;
                }
                default:
                    break;
            }
        }

        doors.forEach((swing, key) => (swing.target = openDoors.has(key) ? 1 : 0));
        gate.target = gateWanted ? 1 : 0;
    };

    // Orders: a parcel that goes counter → picking → packed, then a courier's motorbike to the customers.
    const orderTone = color(theme.palette.success.main);
    const parcelMaterial = new THREE.MeshStandardMaterial({ color: orderTone.clone().lerp(new THREE.Color(0x8b5a2b), 0.65), roughness: 0.8, flatShading: true });
    const parcelGeometry = new THREE.BoxGeometry(0.45, 0.35, 0.45);
    const rideCurve = new THREE.CatmullRomCurve3(ORDER_RIDE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "catmullrom", 0.2);
    const orderRigs = new Map<number, { parcel: THREE.Mesh; bike: THREE.Group }>();
    let orders: WorldOrder[] = [];
    const orderRigFor = (o: WorldOrder) => {
        let rig = orderRigs.get(o.id);
        if (!rig) {
            const parcel = new THREE.Mesh(parcelGeometry, parcelMaterial);
            parcel.castShadow = true;
            const bike = makeBike(driverTone, darkTone, parcelMaterial);
            parcel.visible = bike.visible = false;
            scene.add(parcel, bike);
            rig = { parcel, bike };
            tappable(parcel, "order", o.id);
            tappable(bike, "order", o.id);
            orderRigs.set(o.id, rig);
        }
        return rig;
    };
    const remoteDoor = doorPosition(placeFor("remote_hub"))!;

    const placeOrders = () => {
        const slots = new Map<string, number>();
        const slot = (key: string) => {
            const n = slots.get(key) ?? 0;
            slots.set(key, n + 1);
            return n;
        };
        const onCounter = (rig: { parcel: THREE.Mesh }) => {
            const n = slot("counter");
            if (n >= 10) return;
            // Two rows of five along the counter's length (it runs north–south against the east wall).
            const { width, height } = STORE.counter;
            const [x, z] = placeFor("store_counter").position;
            rig.parcel.visible = true;
            rig.parcel.position.set(x - 0.15 + (Math.floor(n / 5) % 2) * 0.3, height + 0.33, z - width / 2 + 0.4 + (n % 5) * 0.6);
        };
        for (const o of orders) {
            const rig = orderRigFor(o);
            rig.parcel.visible = rig.bike.visible = false;
            const st = orderStateAt(o, now);
            const fromRemote = o.delivery?.source === "remote_hub";
            const inStore = o.delivery?.method === "store";
            switch (st.phase) {
                case "cart":
                case "paying":
                case "paid":
                    onCounter(rig);
                    break;
                case "picking": {
                    const n = slot(fromRemote ? "pick-remote" : "pick-floor");
                    rig.parcel.visible = true;
                    if (fromRemote) rig.parcel.position.set(remoteDoor.at[0] - 1 + (n % 3) * 0.6, 0.3, remoteDoor.at[1] - 1.5 - Math.floor(n / 3) * 0.6);
                    else rig.parcel.position.set(FLOOR_SPOT[0] + (n % 2) * 0.55, 0.32, FLOOR_SPOT[1] + 1.8 + Math.floor(n / 2) * 0.55);
                    break;
                }
                case "packed":
                    if (inStore) onCounter(rig);
                    else {
                        const n = slot("bay");
                        rig.parcel.visible = true;
                        rig.parcel.position.set(BAY_SPOT[0] - 2 + (n % 6) * 0.7, 0.3, BAY_SPOT[1] + 1.5 + Math.floor(n / 6) * 0.7);
                    }
                    break;
                case "out": {
                    if (inStore) {
                        onCounter(rig);
                        break;
                    }
                    const u = Math.min(0.999, Math.max(0.001, st.progress));
                    const at = rideCurve.getPointAt(u);
                    const tangent = rideCurve.getTangentAt(u);
                    rig.bike.visible = true;
                    rig.bike.position.set(at.x, 0, at.z + slot("ride") * 0.2);
                    rig.bike.rotation.y = Math.atan2(-tangent.z, tangent.x);
                    break;
                }
                default:
                    break;
            }
        }
    };

    // Refills: a sign on the bin while it waits, then a stock keeper carrying the carton to it.
    const refillTone = color(theme.palette.info.main);
    const refillRigs = new Map<number, { carton: THREE.Mesh; walker: THREE.Group; badge: CSS2DObject; badgeEl: HTMLDivElement; path: THREE.CatmullRomCurve3 | null }>();
    let refills: WorldRefill[] = [];
    // Which physical spot an item's shelf spot is placed on is not recorded yet, so a refill goes to the middle of the back wall.
    const binSpot = (_itemId: number) => ({ x: STORE.position[0], y: 1.6, z: STORE.position[1] - STORE.size[1] / 2 + STORE.shelfDepth + 0.7 });
    const refillRigFor = (r: WorldRefill) => {
        let rig = refillRigs.get(r.id);
        if (!rig) {
            const carton = new THREE.Mesh(cartonGeometry, cartonMaterial);
            carton.scale.setScalar(0.6);
            carton.castShadow = true;
            const walker = makePerson(keeperTone);
            const badgeEl = document.createElement("div");
            badgeEl.className = "world-badge world-badge--refill";
            const badge = new CSS2DObject(badgeEl);
            carton.visible = walker.visible = badge.visible = false;
            scene.add(carton, walker, badge);
            rig = { carton, walker, badge, badgeEl, path: null };
            tappable(carton, "refill", r.id);
            tappable(walker, "refill", r.id);
            refillRigs.set(r.id, rig);
        }
        return rig;
    };

    const placeRefills = () => {
        let waiting = 0;
        for (const r of refills) {
            const rig = refillRigFor(r);
            rig.carton.visible = rig.walker.visible = rig.badge.visible = false;
            const st = refillStateAt(r, now);
            const spot = binSpot(r.item_id);
            if (st.phase === "raised") {
                if (waiting++ >= 8) continue;
                rig.badge.visible = true;
                rig.badgeEl.textContent = `Refill · ${r.item ?? r.reference}`;
                rig.badge.position.set(spot.x, spot.y + 0.35, spot.z);
            } else if (st.phase === "moving") {
                if (!rig.path) {
                    const points = (r.source === "remote_hub" ? REMOTE_CARRY : [FLOOR_SPOT]).map(([x, z]) => new THREE.Vector3(x, 0, z));
                    points.push(new THREE.Vector3(spot.x, 0, spot.z));
                    rig.path = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2);
                }
                const u = Math.min(1, Math.max(0, st.progress));
                const at = rig.path.getPointAt(u);
                const ahead = rig.path.getPointAt(Math.min(1, u + 0.01));
                rig.walker.visible = rig.carton.visible = true;
                rig.walker.position.set(at.x, STORE.plinth > 0 ? 0.12 : 0, at.z);
                rig.walker.rotation.y = Math.atan2(ahead.x - at.x, ahead.z - at.z);
                // Carried at chest height, lifted into the bin over the last stretch.
                const lift = Math.max(0, (u - 0.85) / 0.15);
                rig.carton.position.set(at.x, 1.05 + (spot.y - 1.05) * lift, at.z);
            }
        }
    };

    // The event being shown: a pulsing ring with a beam, and what happened floating above.
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 48), markerMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 10), beamMaterial);
    beam.position.y = 2.3;
    marker.add(ring, beam);
    marker.visible = false;
    scene.add(marker);
    // The renderer moves the outer element with a transform; the inner one carries the look and the entrance.
    const calloutEl = document.createElement("div");
    calloutEl.className = "world-callout";
    const calloutText = document.createElement("div");
    calloutEl.appendChild(calloutText);
    const callout = new CSS2DObject(calloutEl);
    callout.visible = false;
    scene.add(callout);
    let lit: Highlight | null = null;

    /** Where an event at a place is shown: in front of a hub's door, on the store floor, at the counter… */
    const placeAnchor = (key: PlaceKey): THREE.Vector3 => {
        const p = placeFor(key);
        const door = doorPosition(p);
        if (door) return new THREE.Vector3(door.at[0] + door.out[0] * 2.5, 0, door.at[1] + door.out[1] * 2.5);
        if (key === "store_floor") return new THREE.Vector3(FLOOR_SPOT[0], 0, FLOOR_SPOT[1]);
        if (key === "store_shelf") return new THREE.Vector3(STORE.position[0], 0, STORE.position[1] - 1.5);
        if (key === "loading_bay") return new THREE.Vector3(BAY_SPOT[0], 0, BAY_SPOT[1]);
        // A tall building: in front of it, so it doesn't hide the spot.
        if (p.shape === "tower") return new THREE.Vector3(p.position[0], 0, p.position[1] + p.size[1] / 2 + 2);
        return new THREE.Vector3(p.position[0], 0, p.position[1]);
    };
    /** The thing the event is about, where it is right now, if it is on screen. */
    const subjectAnchor = (h: Highlight): THREE.Vector3 | null => {
        if (h.kind === "shipment") {
            const rig = rigs.get(h.subject);
            if (rig?.van.visible) return rig.van.position.clone().setY(0);
            const carton = rig?.cartons.find((c) => c.visible);
            return carton ? carton.position.clone().setY(0) : null;
        }
        if (h.kind === "order") {
            const rig = orderRigs.get(h.subject);
            if (rig?.bike.visible) return rig.bike.position.clone().setY(0);
            return rig?.parcel.visible ? rig.parcel.position.clone().setY(0) : null;
        }
        const rig = refillRigs.get(h.subject);
        if (rig?.walker.visible) return rig.walker.position.clone().setY(0);
        return rig?.badge.visible ? rig.badge.position.clone().setY(0) : null;
    };
    const anchorOf = (h: Highlight): THREE.Vector3 | null => subjectAnchor(h) ?? (h.where ? placeAnchor(h.where) : null);

    const placeActors = () => {
        placeShipments();
        placeOrders();
        placeRefills();
    };

    // Picking: hover highlights a place, a tap (not a drag) opens it.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered: PlaceKey | null = null;
    let hoveringSubject = false;
    let selectedKey: PlaceKey | null = null;
    let downAt: { x: number; y: number } | null = null;

    const isShown = (object: THREE.Object3D) => {
        for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
        return true;
    };
    const hitAt = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(pickables, false).find((h) => isShown(h.object)) ?? null;
    };
    const paint = () => {
        nodes.forEach((node, key) => {
            const isSelected = key === selectedKey;
            node.pad.material.color.copy(isSelected ? node.tone : key === hovered ? padTone.clone().lerp(node.tone, 0.35) : padTone);
            node.label.classList.toggle("is-selected", isSelected);
        });
        // Pressing the Store Floor or the Store Shelf tints it, so it stands out from the rest of the shop.
        const tint = (key: PlaceKey) => (selectedKey === key ? 0.75 : hovered === key ? 0.3 : 0);
        const floorNode = nodes.get("store_floor");
        if (floorNode) store.floorMaterial.color.copy(store.floorBase).lerp(floorNode.tone, tint("store_floor"));
        const shelfNode = nodes.get("store_shelf");
        if (steel && shelfNode) steel.color.copy(steelBase).lerp(shelfNode.tone, tint("store_shelf"));
        renderer.domElement.style.cursor = hovered || hoveringSubject ? "pointer" : "grab";
    };

    const onMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || event.buttons !== 0) return;
        const hit = hitAt(event);
        const key = (hit?.object.userData.placeKey as PlaceKey | undefined) ?? null;
        const onSubject = Boolean(hit?.object.userData.subject);
        if (key !== hovered || onSubject !== hoveringSubject) {
            hovered = key;
            hoveringSubject = onSubject;
            paint();
        }
    };
    const onDown = (event: PointerEvent) => {
        downAt = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
        if (!downAt) return;
        const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
        downAt = null;
        if (moved >= 6 || game) return;
        // A tap on a van, parcel or carton opens what it carries; on the racking, that spot; anywhere else, the place.
        const hit = hitAt(event);
        const subject = hit?.object.userData.subject as { kind: EventKind; id: number } | undefined;
        if (subject) {
            onSubject(subject.kind, subject.id);
            return;
        }
        const face = hit?.object.userData.shelfFace as ShelfFace | undefined;
        if (face && hit?.uv) {
            onSpot(face.spotAt(hit.uv.x, hit.uv.y));
            return;
        }
        onSelect((hit?.object.userData.placeKey as PlaceKey | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // Labels: when two would overlap, the less important one steps aside.
    const labelOrder = [...[...nodes.values()].map((n) => n.label), ...fixedLabels];
    const declutter = () => {
        const shown: DOMRect[] = [];
        if (callout.visible) shown.push(calloutEl.getBoundingClientRect());
        const ordered = [...labelOrder].sort((a, b) => Number(b.classList.contains("is-selected")) - Number(a.classList.contains("is-selected")));
        for (const el of ordered) {
            const r = el.getBoundingClientRect();
            const overlaps = shown.some((o) => r.left < o.right + 4 && r.right > o.left - 4 && r.top < o.bottom + 2 && r.bottom > o.top - 2);
            el.classList.toggle("is-covered", overlaps);
            if (!overlaps) shown.push(r);
        }
    };

    // Camera flights.
    let flight: { fromCam: THREE.Vector3; toCam: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; eye: boolean } | null = null;
    /** Standing inside the shop at eye level (a wall view): the camera may come close and look level. */
    let eyeLevel = false;
    /** 0 (walls solid) to 1 (walls faded), eased each frame. */
    let wallFade = 0;
    const setLimits = (eye: boolean) => {
        controls.minDistance = eye ? 1 : 6;
        controls.maxPolarAngle = eye ? Math.PI / 2 + 0.05 : 1.35;
    };
    const flyTo = (target: THREE.Vector3, cam: THREE.Vector3, eye = false) => {
        eyeLevel = eye;
        // Coming close needs the limits eased first; going back out, they tighten once we are there.
        if (eye) setLimits(true);
        if (reducedMotion) {
            setLimits(eye);
            controls.target.copy(target);
            camera.position.copy(cam);
            return;
        }
        flight = { fromCam: camera.position.clone(), toCam: cam, fromTarget: controls.target.clone(), toTarget: target, start: performance.now(), eye };
    };
    const flyClose = (x: number, z: number, span: number) => {
        const at = new THREE.Vector3(x, 0, z);
        const from = camera.position.clone().sub(controls.target).setY(0).normalize();
        flyTo(at, at.clone().add(from.multiplyScalar(span * 1.2 + 8)).setY(span * 1.1 + 8));
    };

    // Play: the worker and their jobs (game/GameScene), and where the camera was before they stepped in.
    let game: GameScene | null = null;
    let beforePlay: { camera: THREE.Vector3; target: THREE.Vector3 } | null = null;

    const api: SceneApi = {
        enterPlay: (app, pose, view) => {
            if (game) return;
            flight = null;
            beforePlay = { camera: camera.position.clone(), target: controls.target.clone() };
            game = createGameScene({
                scene, camera, controls, dom: renderer.domElement, overlay: mount, figure: makePerson(toneOf(roleFor(app))), tone: toneOf(roleFor(app)),
                spawn: pose, view, reducedMotion, bounds: [SITE_BOUNDS.min.x, SITE_BOUNDS.min.z, SITE_BOUNDS.max.x, SITE_BOUNDS.max.z],
                zoneTones: { pickup: color(theme.palette.info.main), drop: color(theme.palette.success.main) },
                carTones: { cab: driverTone, body: wallTone.clone().lerp(color(theme.palette.background.paper), 0.5), dark: darkTone },
                onZone: (zone) => setGame({ zone }),
            });
        },
        exitPlay: () => {
            if (!game) return;
            game.dispose();
            game = null;
            if (beforePlay) flyTo(beforePlay.target, beforePlay.camera);
        },
        setView: (view) => game?.setView(view),
        game: () => game,
        select: (key) => {
            if (key === selectedKey) return;
            selectedKey = key;
            paint();
            if (key) {
                const node = nodes.get(key)!;
                flyClose(node.group.position.x, node.group.position.z, Math.max(...node.place.size, 6));
            } else if (!awayFromHome) {
                flyTo(home.target.clone(), home.camera.clone());
            }
        },
        home: () => {
            userMoved = false;
            awayFromHome = false;
            flyTo(home.target.clone(), home.camera.clone());
        },
        setShipments: (next) => {
            shipments = next;
            const keep = new Set(next.map((s) => s.id));
            rigs.forEach((rig, id) => {
                if (keep.has(id)) return;
                scene.remove(rig.van, rig.badge, ...rig.cartons);
                untappable(rig.van, ...rig.cartons);
                rig.badgeEl.remove();
                rigs.delete(id);
            });
            placeShipments();
        },
        setOrders: (next) => {
            orders = next;
            const keep = new Set(next.map((o) => o.id));
            orderRigs.forEach((rig, id) => {
                if (keep.has(id)) return;
                scene.remove(rig.parcel, rig.bike);
                untappable(rig.parcel, rig.bike);
                orderRigs.delete(id);
            });
            placeOrders();
        },
        setRefills: (next) => {
            refills = next;
            const keep = new Set(next.map((r) => r.id));
            refillRigs.forEach((rig, id) => {
                if (keep.has(id)) return;
                scene.remove(rig.carton, rig.walker, rig.badge);
                untappable(rig.carton, rig.walker);
                rig.badgeEl.remove();
                refillRigs.delete(id);
            });
            placeRefills();
        },
        setTime: (t) => {
            now = t;
            placeActors();
        },
        setSpot: (code) => shelfFaces.forEach((face) => face.paint(code)),
        viewStore: () => {
            userMoved = true;
            awayFromHome = true;
            flyClose(STORE.position[0], STORE.position[1], 6);
        },
        viewWall: (side) => {
            userMoved = true;
            awayFromHome = true;
            const run = RACKS.find((r) => r.wall === side)!;
            const toward: Record<RackWall, [number, number]> = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] };
            const [dx, dz] = toward[side];
            const [cx, cz] = STORE.position;
            const reach = (side === "west" || side === "east" ? STORE.size[0] : STORE.size[1]) / 2 - STORE.shelfDepth;
            // The seller's side: stand at the opposite side of the shop, at eye height, and look at the racks.
            // Stand right back against the far wall, unless racks stand on the floor there: then in front of them.
            const behind = RACKS.find((r) => r.wall === ({ west: "east", east: "west", north: "south", south: "north" } as Record<RackWall, RackWall>)[side])!;
            const stand = behind.suspended ? 2.75 : 2.2;
            flyTo(new THREE.Vector3(cx + dx * reach, run.suspended ? 2.5 : 1.7, cz + dz * reach), new THREE.Vector3(cx - dx * stand, 1.65, cz - dz * stand), true);
        },
        highlight: (h, fly) => {
            lit = h;
            marker.visible = callout.visible = h !== null;
            if (!h) return;
            markerMaterial.color.set(h.tone);
            beamMaterial.color.set(h.tone);
            calloutText.style.setProperty("--tone", h.tone);
            calloutText.textContent = h.text;
            // Re-run the entrance animation for each new event.
            calloutText.style.animation = "none";
            void calloutText.offsetWidth;
            calloutText.style.animation = "";
            if (fly) {
                const at = (h.where ? placeAnchor(h.where) : null) ?? anchorOf(h);
                if (at) {
                    awayFromHome = true;
                    const where = h.where ? placeFor(h.where) : null;
                    flyClose(at.x, at.z, where?.indoor ? 7 : where?.shape === "tower" ? 18 : 12);
                }
            }
        },
    };

    const resize = new ResizeObserver(() => {
        width = mount.clientWidth;
        height = mount.clientHeight;
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        labels.setSize(width, height);
        home = homeView(width / height);
        controls.maxDistance = Math.max(260, home.distance * 1.5);
        if (!userMoved && !selectedKey && !awayFromHome) {
            camera.position.copy(home.camera);
            controls.target.copy(home.target);
        }
    });
    resize.observe(mount);

    // The loop.
    const startedAt = performance.now();
    let frame = 0;
    const easeSwing = (swing: Swing) => {
        swing.open += (swing.target - swing.open) * (reducedMotion ? 1 : 0.08);
        for (const leaf of swing.leaves) leaf.pivot.rotation.y = leaf.closed + (leaf.opened - leaf.closed) * swing.open;
    };
    let lastFrame = performance.now();
    const nearDoors = openings();
    const animate = () => {
        frame = requestAnimationFrame(animate);
        const time = (performance.now() - startedAt) / 1000;
        // Seconds since the last frame, capped so a tab coming back does not teleport the worker.
        const dt = Math.min(0.05, (performance.now() - lastFrame) / 1000);
        lastFrame = performance.now();
        game?.update(dt);
        const gameCamera = game?.ownsCamera() ?? false;
        // Doors and the gate swing open as the worker comes up to them.
        if (game && player.pose) {
            for (const { key, at } of nearDoors) {
                if (Math.hypot(player.pose.x - at[0], player.pose.z - at[1]) < 4) (key === "gate" ? gate : doors.get(key as PlaceKey))!.target = 1;
            }
        }

        if (flight && !gameCamera) {
            const k = Math.min(1, (performance.now() - flight.start) / 900);
            const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            camera.position.lerpVectors(flight.fromCam, flight.toCam, eased);
            controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
            if (k >= 1) {
                setLimits(flight.eye);
                flight = null;
            }
        }

        // Roofs lift off once you come close, to show the cells inside.
        const close = camera.position.distanceTo(controls.target) < 75;
        roofs.forEach((r) => (r.visible = !close));

        // The shop's walls fade away when you are inside it, near it, looking at a wall of racks,
        // or have pressed one of its places: they would only be in the way.
        const [storeX, storeZ] = STORE.position;
        const nearStore = Math.hypot(camera.position.x - storeX, camera.position.z - storeZ) < 26 && camera.position.y < 40;
        const wantFade = eyeLevel || nearStore || selectedKey === "store_shelf" || selectedKey === "store_floor" || selectedKey === "store_counter";
        wallFade += ((wantFade ? 1 : 0) - wallFade) * (reducedMotion ? 1 : 0.12);
        const faded = wallFade > 0.02;
        if (store.wallMaterial.transparent !== faded) {
            store.wallMaterial.transparent = faded;
            store.wallMaterial.needsUpdate = true;
        }
        store.wallMaterial.opacity = 1 - 0.88 * wallFade;
        store.wallMaterial.depthWrite = wallFade < 0.5;
        fixedLabels[1].style.visibility = wantFade ? "hidden" : "";
        // A faded wall would still throw a solid shadow into the shop.
        store.walls.forEach((wallMesh) => (wallMesh.castShadow = wallFade < 0.5));

        doors.forEach(easeSwing);
        easeSwing(gate);

        if (lit) {
            const at = anchorOf(lit);
            marker.visible = callout.visible = at !== null;
            if (at) {
                marker.position.copy(at);
                callout.position.set(at.x, 5, at.z);
                ring.scale.setScalar(reducedMotion ? 1 : 1 + 0.25 * Math.sin(time * 4));
                markerMaterial.opacity = reducedMotion ? 0.9 : 0.65 + 0.3 * Math.sin(time * 4);
            }
        }

        if (!reducedMotion) for (const p of people) p.mesh.position.y = p.base + Math.max(0, Math.sin(time * 3 + p.phase)) * 0.12;

        if (!gameCamera) controls.update();
        renderer.render(scene, camera);
        labels.render(scene, camera);
        declutter();
    };
    animate();

    const dispose = () => {
        cancelAnimationFrame(frame);
        game?.dispose();
        resize.disconnect();
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.dispose();

        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        scene.traverse((object) => {
            const m = object as THREE.Mesh;
            if (!m.isMesh) return;
            geometries.add(m.geometry);
            (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
        });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
        });

        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        labels.domElement.remove();
    };

    return { api, dispose };
}

/* ------------------------------------------------------------------------ */
/* Framing                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The view of the whole site, framed to fill the screen: from the south on a
 * wide screen, from the east on a tall one (so the long site runs top to
 * bottom on a phone, hubs at the top). The distance is the closest at which
 * every corner of the site stays on screen, clear of the top bar and of the
 * timeline at the bottom.
 */
function homeView(aspect: number): { target: THREE.Vector3; camera: THREE.Vector3; distance: number } {
    const portrait = aspect < 0.9;
    const elevation = portrait ? 1.05 : 0.85;
    const along = portrait ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const direction = along.multiplyScalar(Math.cos(elevation)).setY(Math.sin(elevation)).normalize();
    const bottom = portrait ? -0.25 : -0.4;
    const top = portrait ? 0.82 : 0.8;

    const probe = new THREE.PerspectiveCamera(40, aspect, 0.5, 900);
    const corners: THREE.Vector3[] = [];
    for (const x of [SITE_BOUNDS.min.x, SITE_BOUNDS.max.x]) for (const y of [SITE_BOUNDS.min.y, SITE_BOUNDS.max.y]) for (const z of [SITE_BOUNDS.min.z, SITE_BOUNDS.max.z]) corners.push(new THREE.Vector3(x, y, z));

    // Aim a little towards the camera, so the site rides up into the free band.
    const lift = new THREE.Vector3().copy(direction).setY(0).normalize();
    let distance = 30;
    let target = SITE_CENTER.clone();
    for (let i = 0; i < 120; i++) {
        target = SITE_CENTER.clone().addScaledVector(lift, distance * (portrait ? 0.14 : 0.1));
        probe.position.copy(target).addScaledVector(direction, distance);
        probe.lookAt(target);
        probe.updateMatrixWorld();
        const fits = corners.every((c) => {
            const p = c.clone().project(probe);
            return Math.abs(p.x) < 0.92 && p.y > bottom && p.y < top;
        });
        if (fits) break;
        distance *= 1.04;
    }

    return { target, camera: target.clone().addScaledVector(direction, distance), distance };
}

/* ------------------------------------------------------------------------ */
/* Scenery, buildings, vans and people: in metres                            */
/* ------------------------------------------------------------------------ */

function mesh(geometry: THREE.BufferGeometry, color: THREE.Color, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true }));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

function fixedLabel(text: string, x: number, y: number, z: number): HTMLDivElement & { object: CSS2DObject } {
    const el = document.createElement("div") as HTMLDivElement & { object: CSS2DObject };
    el.className = "world-label world-label--fixed";
    el.textContent = text;
    el.object = new CSS2DObject(el);
    el.object.position.set(x, y, z);
    return el;
}

function labelHeight(place: Place): number {
    if (place.indoor) return 3.4;
    switch (place.shape) {
        case "hub": return (place.height ?? 6) + Math.min(place.size[0], place.size[1]) * 0.18 + 2;
        case "tower": return (place.height ?? 8) + 2;
        case "platform": return 2.4;
        default: return 5;
    }
}

/** A pitched roof whose ridge runs along x (or z): a triangle extruded across the width. */
function roof(width: number, depth: number, rise: number, color: THREE.Color, y: number, ridgeAlongZ = false): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, 0);
    shape.lineTo(depth / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(0, 0, -width / 2);
    const r = mesh(geometry, color, 0, y, 0);
    if (!ridgeAlongZ) r.rotation.y = Math.PI / 2;
    return r;
}

/** Wraps an angle into (-π, π]. */
function wrap(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a <= -Math.PI) a += Math.PI * 2;
    return a;
}

/**
 * A pair of swing leaves filling the opening from (x1, z1) to (x2, z2), each
 * hinged at its own end, opening 90° towards `out` ([x, z], a unit vector).
 */
function swingPair(x1: number, z1: number, x2: number, z2: number, height: number, out: [number, number], color: THREE.Color): { group: THREE.Group; swing: Swing } {
    const group = new THREE.Group();
    const span = Math.hypot(x2 - x1, z2 - z1);
    const leafWidth = span / 2 - 0.04;
    // A pivot's rotation.y = θ points its +x at (cos θ, −sin θ) in (x, z).
    const toward = (dx: number, dz: number) => Math.atan2(-dz, dx);
    const outAngle = toward(out[0], out[1]);
    const leaves: Swing["leaves"] = [];

    for (const [hx, hz, fx, fz] of [[x1, z1, x2, z2], [x2, z2, x1, z1]] as Array<[number, number, number, number]>) {
        const pivot = new THREE.Group();
        pivot.position.set(hx, 0, hz);
        pivot.add(mesh(new THREE.BoxGeometry(leafWidth, height, 0.08), color, leafWidth / 2, height / 2, 0));
        const closed = toward(fx - hx, fz - hz);
        const opened = closed + wrap(outAngle - closed);
        pivot.rotation.y = closed;
        leaves.push({ pivot, closed, opened });
        group.add(pivot);
    }

    return { group, swing: { leaves, open: 0, target: 0 } };
}

/** The fenced yard, laid out from the site photo, with its two-leaf swing gate. Returns the gate. */
function addCompound(scene: THREE.Scene, wall: THREE.Color, dark: THREE.Color, yard: THREE.Color): Swing {
    const shape = new THREE.Shape();
    COMPOUND.corners.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
    shape.closePath();
    const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: yard.clone().lerp(dark, 0.18), roughness: 1 }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = 0.03;
    slab.receiveShadow = true;
    scene.add(slab);

    const railTone = dark.clone().lerp(wall, 0.3);
    const post = new THREE.CylinderGeometry(0.08, 0.08, 2, 6);
    const [gx, gz] = COMPOUND.gate.at;
    const half = COMPOUND.gate.width / 2;

    const fence = (x1: number, z1: number, x2: number, z2: number) => {
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (length < 0.1) return;
        for (let s = 0; s <= length + 0.01; s += 2.5) {
            const t = Math.min(1, s / length);
            scene.add(mesh(post, railTone, x1 + (x2 - x1) * t, 1, z1 + (z2 - z1) * t));
        }
        for (const y of [0.6, 1.8]) {
            const rail = mesh(new THREE.BoxGeometry(length, 0.08, 0.08), railTone, (x1 + x2) / 2, y, (z1 + z2) / 2);
            rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
            scene.add(rail);
        }
    };

    const corners = COMPOUND.corners;
    for (let i = 0; i < corners.length; i++) {
        const [x1, z1] = corners[i];
        const [x2, z2] = corners[(i + 1) % corners.length];
        if (x1 === gx && x2 === gx) {
            // The east fence, with the gate in it.
            const [lo, hi] = [Math.min(z1, z2), Math.max(z1, z2)];
            fence(gx, lo, gx, gz - half);
            fence(gx, gz + half, gx, hi);
        } else {
            fence(x1, z1, x2, z2);
        }
    }

    for (const z of [gz - half, gz + half]) scene.add(mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), dark, gx, 1.2, z));
    const { group, swing } = swingPair(gx, gz - half, gx, gz + half, 2, [1, 0], railTone);
    scene.add(group);
    return swing;
}

/** The roads (places.ts ROADS), each a flat asphalt ribbon 4.5 m wide. */
function addRoads(scene: THREE.Scene, asphalt: THREE.Color): void {
    const material = new THREE.MeshStandardMaterial({ color: asphalt, roughness: 1, side: THREE.DoubleSide });
    ROADS.forEach((points, r) => {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "catmullrom", 0.2);
        const samples = curve.getSpacedPoints(Math.round(curve.getLength()));
        const positions: number[] = [];
        samples.forEach((p, i) => {
            const t = curve.getTangentAt(i / (samples.length - 1));
            const y = 0.05 + r * 0.004;
            positions.push(p.x - t.z * 2.25, y, p.z + t.x * 2.25, p.x + t.z * 2.25, y, p.z - t.x * 2.25);
        });
        const indices: number[] = [];
        for (let i = 0; i < samples.length - 1; i++) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const road = new THREE.Mesh(geometry, material);
        road.receiveShadow = true;
        scene.add(road);
    });
}

/** What the scene keeps of the shop's shell: its floor to tint, and its walls to fade. */
interface StoreShell {
    floor: THREE.Mesh;
    floorMaterial: THREE.MeshStandardMaterial;
    floorBase: THREE.Color;
    wallMaterial: THREE.MeshStandardMaterial;
    walls: THREE.Mesh[];
}

/** The store's four walls, open-topped, with the 2 m main door in the south wall, a sign over it and the metal divider inside. */
function addStoreShell(scene: THREE.Scene, wall: THREE.Color, tone: THREE.Color, floor: THREE.Color): StoreShell {
    const [cx, cz] = STORE.position;
    const [w, d] = STORE.size;
    const h = STORE.wall;
    const t = 0.2;
    const doorX = cx - w / 2 + STORE.door.at;
    const half = STORE.door.width / 2;

    // One material for every wall, so they all fade together.
    const wallMaterial = new THREE.MeshStandardMaterial({ color: wall, roughness: 0.75, flatShading: true });
    const walls: THREE.Mesh[] = [];
    const piece = (geometry: THREE.BoxGeometry, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geometry, wallMaterial);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        walls.push(m);
        scene.add(m);
    };

    const floorBase = floor.clone().lerp(wall, 0.5);
    const slab = mesh(new THREE.BoxGeometry(w, 0.1, d), floorBase.clone(), cx, 0.05, cz);
    scene.add(slab);

    piece(new THREE.BoxGeometry(w + t, h, t), cx, h / 2, cz - d / 2 - t / 2);
    piece(new THREE.BoxGeometry(t, h, d), cx - w / 2 - t / 2, h / 2, cz);
    piece(new THREE.BoxGeometry(t, h, d), cx + w / 2 + t / 2, h / 2, cz);
    // South wall: either side of the door, and above it.
    const leftLength = doorX - half - (cx - w / 2);
    const rightLength = cx + w / 2 - (doorX + half);
    piece(new THREE.BoxGeometry(leftLength, h, t), cx - w / 2 + leftLength / 2, h / 2, cz + d / 2 + t / 2);
    piece(new THREE.BoxGeometry(rightLength, h, t), cx + w / 2 - rightLength / 2, h / 2, cz + d / 2 + t / 2);
    piece(new THREE.BoxGeometry(STORE.door.width, h - STORE.door.height, t), doorX, (h + STORE.door.height) / 2, cz + d / 2 + t / 2);
    scene.add(mesh(new THREE.BoxGeometry(5, 0.6, 0.15), tone, doorX, h + 0.35, cz + d / 2 + t + 0.05));
    // The metal divider fixed to the front wall at the door's west jamb, 1.2 m into the shop.
    scene.add(mesh(new THREE.BoxGeometry(0.06, 2, 1.2), wall.clone().lerp(new THREE.Color(0x56697a), 0.75), doorX - half - 0.03, 1.1, cz + d / 2 - 0.6));

    return { floor: slab, floorMaterial: slab.material as THREE.MeshStandardMaterial, floorBase, wallMaterial, walls };
}

/** One wall of racks: a picture of its spots (a1, a2 …), repainted when one is marked. */
interface ShelfFace {
    paint: (selected: string | null) => void;
    /** The spot ("f6") under a point on the face, from its uv. */
    spotAt: (u: number, v: number) => string;
}

/**
 * The Main Store's physical racking (see storeLayout.ts): open steel racks 50 cm
 * deep, standing from the floor on the left and back walls and hanging from the
 * ceiling on the right wall and over the door. Each run is a board under every
 * row and an upright between every column, with the spots' labels on the back
 * against the wall. The boards are not tappable, so a tap goes through to the
 * spot behind them.
 */
function makeShelves(wall: THREE.Color, dark: THREE.Color): { group: THREE.Group; faces: ShelfFace[]; steel: THREE.MeshStandardMaterial } {
    const g = new THREE.Group();
    const [w, d] = STORE.size;
    const dep = STORE.shelfDepth;
    const backTone = wall.clone().lerp(dark, 0.3);
    const steel = new THREE.MeshStandardMaterial({ color: backTone.clone().lerp(new THREE.Color(0x6b4423), 0.55), roughness: 0.75, flatShading: true });
    const faces: ShelfFace[] = [];

    for (const run of RACKS) {
        const side = run.wall;
        const cols = run.columns.length;
        const rows = run.rows;
        const alongX = side === "north" || side === "south";
        const span = (alongX ? w : d) - 2 * dep;
        const { height, centerY, rowHeight } = rackFace(run);

        // Where a point a fraction u along the face (read from inside the shop, left to right), e metres out from the wall, stands.
        const pos = (u: number, e: number): [number, number] => {
            const along = (u - 0.5) * span;
            switch (side) {
                case "west": return [-w / 2 + e, -along];
                case "east": return [w / 2 - e, along];
                case "north": return [along, -d / 2 + e];
                case "south": return [-along, d / 2 - e];
            }
        };

        const addPart = (geometry: THREE.BoxGeometry, u: number, y: number): void => {
            const [x, z] = pos(u, dep / 2);
            const part = new THREE.Mesh(geometry, steel);
            part.position.set(x, y, z);
            part.castShadow = true;
            part.raycast = () => {};
            g.add(part);
        };
        for (let k = 0; k <= rows; k++) {
            addPart(new THREE.BoxGeometry(alongX ? span : dep, 0.04, alongX ? dep : span), 0.5, centerY + height / 2 - k * rowHeight);
        }
        for (let j = 0; j <= cols; j++) {
            addPart(new THREE.BoxGeometry(alongX ? 0.05 : dep, height, alongX ? dep : 0.05), j / cols, centerY);
        }
        // A suspended run hangs from the ceiling on two rods at each end.
        if (run.suspended) {
            for (const u of [0, 1]) {
                const [x, z] = pos(u, dep / 2);
                const rod = new THREE.Mesh(new THREE.BoxGeometry(0.04, STORE.wall - (centerY + height / 2) + 0.01, 0.04), steel);
                rod.position.set(x, (STORE.wall + centerY + height / 2) / 2, z);
                rod.raycast = () => {};
                g.add(rod);
            }
        }

        // The face: a canvas of spots on a plane against the wall, facing into the shop.
        const canvas = document.createElement("canvas");
        canvas.width = cols * 128;
        canvas.height = rows * 96;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(span, height), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
        const [backX, backZ] = pos(0.5, 0.04);
        plane.position.set(backX, centerY, backZ);
        plane.rotation.y = side === "west" ? Math.PI / 2 : side === "east" ? -Math.PI / 2 : side === "south" ? Math.PI : 0;
        g.add(plane);

        const face: ShelfFace = {
            spotAt: (u, v) => spotAt(run, u, v),
            paint: (selected) => {
                const ctx = canvas.getContext("2d")!;
                const cw = canvas.width / cols;
                const ch = canvas.height / rows;
                ctx.fillStyle = `#${backTone.getHexString()}`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                for (let row = 0; row < rows; row++) {
                    for (let col = 0; col < cols; col++) {
                        const code = `${run.columns[col]}${row + 1}`;
                        const x = col * cw;
                        const y = row * ch;
                        ctx.fillStyle = code === selected ? "#ffd54f" : "#f5f1ea";
                        ctx.fillRect(x + 4, y + 4, cw - 8, ch - 8);
                        ctx.fillStyle = "#3b2a1a";
                        ctx.font = "800 34px system-ui, sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(code, x + cw / 2, y + ch / 2);
                    }
                }
                texture.needsUpdate = true;
            },
        };
        plane.userData.shelfFace = face;
        face.paint(null);
        faces.push(face);
    }

    return { group: g, faces, steel };
}

/**
 * A hub: four walls you can see into once the roof lifts, a double swing door,
 * and (for the Main Hubs) a floor of named 1 m cells with the walkway marked.
 */
function makeHub(place: Place, tone: THREE.Color, wall: THREE.Color, dark: THREE.Color, floor: THREE.Color): { group: THREE.Group; roof: THREE.Object3D; swing: Swing | null } {
    const g = new THREE.Group();
    const [w, d] = place.size;
    const h = place.height ?? 5;
    const t = 0.25;
    const doorHeight = 3.2;
    const door = place.door;

    const sides: Record<string, [number, number, number, number]> = {
        north: [-w / 2, -d / 2, w / 2, -d / 2],
        south: [-w / 2, d / 2, w / 2, d / 2],
        west: [-w / 2, -d / 2, -w / 2, d / 2],
        east: [w / 2, -d / 2, w / 2, d / 2],
    };
    const wallSegment = (x1: number, z1: number, x2: number, z2: number, y0: number, y1: number) => {
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (length < 0.05 || y1 <= y0) return;
        const m = mesh(new THREE.BoxGeometry(length, y1 - y0, t), wall, (x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2);
        m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        g.add(m);
    };

    let swing: Swing | null = null;
    for (const [name, [x1, z1, x2, z2]] of Object.entries(sides)) {
        if (!door || door.wall !== name) {
            wallSegment(x1, z1, x2, z2, 0, h);
            continue;
        }
        // Split around the door; a lintel above it.
        const length = Math.hypot(x2 - x1, z2 - z1);
        const a = (door.at - door.width / 2) / length;
        const b = (door.at + door.width / 2) / length;
        const [ax, az] = [x1 + (x2 - x1) * a, z1 + (z2 - z1) * a];
        const [bx, bz] = [x1 + (x2 - x1) * b, z1 + (z2 - z1) * b];
        wallSegment(x1, z1, ax, az, 0, h);
        wallSegment(bx, bz, x2, z2, 0, h);
        wallSegment(ax, az, bx, bz, doorHeight, h);
        const pair = swingPair(ax, az, bx, bz, doorHeight, doorPosition(place)!.out, dark.clone().lerp(tone, 0.35));
        g.add(pair.group);
        swing = pair.swing;
    }

    if (place.cells) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: cellTexture(place, floor, dark, tone), roughness: 0.95 }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = 0.14;
        plane.receiveShadow = true;
        g.add(plane);
    }

    const alongZ = d > w;
    const roofMesh = roof(alongZ ? d + 0.4 : w + 0.4, alongZ ? w + 0.6 : d + 0.6, Math.min(w, d) * 0.18, tone, h, alongZ);
    g.add(roofMesh);

    return { group: g, roof: roofMesh, swing };
}

/** A hub floor as a picture: each 1 m cell outlined and named, the walkway hatched. */
function cellTexture(place: Place, floor: THREE.Color, dark: THREE.Color, tone: THREE.Color): THREE.CanvasTexture {
    const [w, d] = place.size;
    const px = 48;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * px);
    canvas.height = Math.round(d * px);
    const ctx = canvas.getContext("2d")!;
    const hex = (c: THREE.Color) => `#${c.getHexString()}`;
    const white = new THREE.Color(0xffffff);

    ctx.fillStyle = hex(floor.clone().lerp(white, 0.35));
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { cells, aisles } = hubLayout(place);
    const toPx = (x: number, z: number): [number, number] => [(x + w / 2) * px, (z + d / 2) * px];

    for (const [x0, z0, x1, z1] of aisles) {
        const [ax, az] = toPx(x0, z0);
        const [bx, bz] = toPx(x1, z1);
        ctx.fillStyle = hex(tone.clone().lerp(white, 0.65));
        ctx.fillRect(ax, az, bx - ax, bz - az);
        ctx.save();
        ctx.beginPath();
        ctx.rect(ax, az, bx - ax, bz - az);
        ctx.clip();
        ctx.strokeStyle = hex(tone.clone().lerp(white, 0.35));
        ctx.lineWidth = 6;
        for (let s = 0; s < canvas.width + canvas.height; s += 24) {
            ctx.beginPath();
            ctx.moveTo(s, 0);
            ctx.lineTo(s - canvas.height, canvas.height);
            ctx.stroke();
        }
        ctx.restore();
    }

    ctx.strokeStyle = hex(dark.clone().lerp(floor, 0.45));
    ctx.lineWidth = 2;
    ctx.fillStyle = hex(dark);
    ctx.font = `700 ${Math.round(px * 0.3)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const cell of cells) {
        const [cx, cz] = toPx(cell.x, cell.z);
        ctx.strokeRect(cx - px / 2 + 2, cz - px / 2 + 2, px - 4, px - 4);
        ctx.fillText(cell.name, cx, cz);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function makeBuilding(place: Place, tone: THREE.Color, wall: THREE.Color, dark: THREE.Color): THREE.Group {
    const g = new THREE.Group();
    const [w, d] = place.size;
    const h = place.height ?? 4;
    const glass = new THREE.Color(0x9fc3d6);

    switch (place.shape) {
        case "platform": {
            g.add(mesh(new THREE.BoxGeometry(w, 0.3, d), wall.clone().lerp(dark, 0.2), 0, 0.15, 0));
            // Painted edging, so it reads as a marked area.
            for (const [x, z, sx, sz] of [[0, -d / 2, w, 0.25], [0, d / 2, w, 0.25], [-w / 2, 0, 0.25, d], [w / 2, 0, 0.25, d]] as Array<[number, number, number, number]>) {
                g.add(mesh(new THREE.BoxGeometry(sx, 0.32, sz), tone, x, 0.16, z));
            }
            break;
        }
        case "floor": {
            // The open floor beside the counter (places.ts FLOOR_ZONES): pallet areas, with cartons stacked one or two high.
            const carton = tone.clone().lerp(new THREE.Color(0x8b5a2b), 0.55);
            const patch = tone.clone().lerp(wall, 0.75);
            for (const [x, z, zw, zd] of FLOOR_ZONES) g.add(mesh(new THREE.BoxGeometry(zw, 0.04, zd), patch, x, 0.13, z));
            palletCentres().forEach(([x, pz, i]) => {
                g.add(mesh(new THREE.BoxGeometry(PALLET, 0.12, PALLET), dark, x, 0.2, pz));
                for (let y = 0; y < 1 + (i % 2); y++) g.add(mesh(new THREE.BoxGeometry(1.1, 0.6, 1.1), carton, x, 0.56 + y * 0.62, pz));
            });
            break;
        }
        case "counter": {
            // Its footprint (place.size) runs along the east wall: 0.8 m deep in x, 3.2 m long in z.
            const ch = STORE.counter.height;
            g.add(mesh(new THREE.BoxGeometry(w, ch, d), wall.clone().lerp(dark, 0.15), 0, ch / 2 + 0.1, 0));
            g.add(mesh(new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1), tone, 0, ch + 0.13, 0));
            break;
        }
        case "bay": {
            g.add(mesh(new THREE.BoxGeometry(w, 0.2, d), tone, 0, 4, 0));
            for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) g.add(mesh(new THREE.BoxGeometry(0.25, 4, 0.25), dark, x, 2, z));
            break;
        }
        case "houses": {
            HOUSES.forEach(([x, z, hh]) => {
                g.add(mesh(new THREE.BoxGeometry(HOUSE_SIZE, hh, HOUSE_SIZE), wall, x, hh / 2, z));
                const top = mesh(new THREE.ConeGeometry(2.6, 1.8, 4), tone, x, hh + 0.9, z);
                top.rotation.y = Math.PI / 4;
                g.add(top);
            });
            break;
        }
        case "tower": {
            g.add(mesh(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0));
            g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), tone, 0, h + 0.2, 0));
            for (let y = 1.4; y < h - 0.5; y += 1.6) g.add(mesh(new THREE.BoxGeometry(w - 1, 0.7, 0.1), glass, 0, y, d / 2 + 0.03));
            break;
        }
        default:
            break;
    }

    return g;
}

/** A box van, 5.2 × 2 m, nose along +x: cab in the driver's colour, white body. */
function makeVan(tone: THREE.Color, body: THREE.Color, dark: THREE.Color): THREE.Group {
    const van = new THREE.Group();
    van.add(mesh(new THREE.BoxGeometry(3.6, 2.2, 2), body.clone().lerp(new THREE.Color(0xffffff), 0.6), -0.8, 1.5, 0));
    van.add(mesh(new THREE.BoxGeometry(1.5, 1.6, 1.9), tone, 1.75, 1.2, 0));
    van.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 1.6), new THREE.Color(0x9fc3d6), 2.5, 1.55, 0));
    for (const x of [-1.8, 1.6]) for (const z of [-0.95, 0.95]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14), dark, x, 0.4, z);
        wheel.rotation.x = Math.PI / 2;
        van.add(wheel);
    }
    return van;
}

/** A courier's motorbike, nose along +x, with its rider and the parcel box on the back. */
function makeBike(tone: THREE.Color, dark: THREE.Color, boxMaterial: THREE.Material): THREE.Group {
    const bike = new THREE.Group();
    bike.add(mesh(new THREE.BoxGeometry(1.5, 0.35, 0.3), tone, 0, 0.65, 0));
    for (const x of [-0.6, 0.6]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), dark, x, 0.32, 0);
        wheel.rotation.x = Math.PI / 2;
        bike.add(wheel);
    }
    const rider = makePerson(tone);
    rider.scale.setScalar(0.85);
    rider.position.set(-0.05, 0.4, 0);
    bike.add(rider);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), boxMaterial);
    box.position.set(-0.65, 1.0, 0);
    box.castShadow = true;
    bike.add(box);
    return bike;
}

function makePerson(tone: THREE.Color): THREE.Group {
    const person = new THREE.Group();
    person.add(mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 10), tone, 0, 0.65, 0));
    person.add(mesh(new THREE.SphereGeometry(0.25, 14, 10), new THREE.Color(0xb07a4b), 0, 1.45, 0));
    return person;
}
