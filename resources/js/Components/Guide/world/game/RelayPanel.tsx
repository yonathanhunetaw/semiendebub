import { useEffect } from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import type { GameScene } from "./GameScene";
import { getGame, kept, setGame } from "./gameStore";
import { MAX_BOXES, formatCbm } from "./practice";
import { handOver, handToCourier, jobSize, putBackAtHub, receive, refreshRelay, relayBoxesToDraw, roleNow, startRelay, takeAtHub, type RelayJob, type RelayRole, type RelayState } from "./relay";
import type { ZoneKey } from "./zones";

/**
 * Remote Hub → Store, the screen side (relay.ts for the rules). Practice
 * only: one worker plays the hub keeper, the courier and the store keeper in
 * turn; the boxes change hands at each door, and the vest changes colour
 * with the role. Nothing is saved.
 */

export type RelayNote = { tone: "success" | "info" | "warning"; text: string };

export const ROLE_NAME: Record<RelayRole, string> = { hub_keeper: "the Remote Hub's keeper", courier: "the courier", store_keeper: "the store's keeper" };

export function useRelay(jobs: RelayJob[] | null, scene: () => GameScene | null, note: (n: RelayNote) => void) {
    // A fresh list merges into the running relay without undoing it.
    useEffect(() => {
        if (!jobs) return;
        const current = getGame().relay;
        setGame({ relay: current ? refreshRelay(current, jobs) : startRelay(jobs) });
    }, [jobs]);

    // Dressed as whoever carries now: the courier in the delivery colour, a keeper in hi-vis.
    const role = getGame().relay ? roleNow(getGame().relay!) : null;
    useEffect(() => {
        kept.courier = role === "courier";
        scene()?.setCourier(role === "courier");
    }, [role, scene]);

    const stack = (state: RelayState, from: ZoneKey | null) => {
        kept.boxes = relayBoxesToDraw(state, MAX_BOXES);
        scene()?.setCarried(kept.boxes, from);
    };

    const take = (key: string) => {
        const state = getGame().relay;
        if (!state) return;
        const result = takeAtHub(state, key);
        if (!result.ok) return note({ tone: "warning", text: result.reason });
        setGame({ relay: result.state });
        stack(result.state, "remote");
    };
    const putBack = () => {
        const state = getGame().relay;
        if (!state) return;
        const result = putBackAtHub(state);
        if (!result.ok) return note({ tone: "warning", text: result.reason });
        setGame({ relay: result.state });
        stack(result.state, null);
    };

    /** At the Remote Hub's door: the boxes go over to the courier, who is now you. */
    const toCourier = async () => {
        const state = getGame().relay;
        if (!state) return;
        const result = handToCourier(state);
        if (!result.ok) return note({ tone: "warning", text: result.reason });
        await scene()?.unloadAt("remote_door");
        setGame({ relay: result.state });
        stack(result.state, "remote_door");
        note({ tone: "info", text: "Handed to the courier: it is In Delivery now. You are the courier: take it round to the shop's front door." });
    };

    /** At the shop's door: the courier hands it over (refused if it never went through a courier). */
    const atDoor = async () => {
        const state = getGame().relay;
        if (!state) return;
        const result = handOver(state);
        if (!result.ok) return note({ tone: "warning", text: result.reason });
        await scene()?.unloadAt("store_door");
        setGame({ relay: result.state });
        note({ tone: "info", text: "Handed over at the door. You are the store's keeper now: check it, then receive it." });
    };

    /** The store keeper checks what was handed over and receives it onto the floor. */
    const receiveIn = () => {
        const state = getGame().relay;
        if (!state) return;
        const result = receive(state);
        if (!result.ok) return note({ tone: "warning", text: result.reason });
        const arrived = state.handedOver;
        setGame({ relay: result.state });
        const refill = arrived.some((j) => j.serverStage === "to_accept");
        note({
            tone: "success",
            text: `Received ${arrived.map((j) => j.reference).join(", ")} onto the store floor.${refill ? " A refill then goes on to the shelf: it shows up on the shelving list." : ""} Practice: nothing was saved.`,
        });
    };

    return { role, take, putBack, toCourier, atDoor, receive: receiveIn };
}

/** Who the worker is right now, while a relay is under way. */
export function RoleChip({ role }: { role: RelayRole }) {
    return <Chip size="small" color={role === "courier" ? "secondary" : "default"} label={`You are ${ROLE_NAME[role]}`} sx={{ fontWeight: 800 }} />;
}

/** In the Remote Hub: what waits for a courier, to take out (whole). */
export function RemotePicker({ state, onTake, onPutBack, onClose }: {
    state: RelayState;
    onTake: (key: string) => void;
    onPutBack: () => void;
    onClose: () => void;
}) {
    const jobs = [...state.waiting].sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const holding = state.carrier === "hub_keeper" ? state.carrying : [];

    return (
        <Paper elevation={0} sx={{ pointerEvents: "auto", width: "100%", maxWidth: 420, maxHeight: { xs: "34dvh", sm: "40dvh" }, display: "flex", flexDirection: "column", borderRadius: 4, boxShadow: 6, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 900, flex: 1 }} noWrap>Remote Hub: for the store</Typography>
                {holding.length > 0 && <Button size="small" onClick={onPutBack} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Put back all</Button>}
                <IconButton size="small" onClick={onClose} aria-label="Close the list"><CloseRounded fontSize="small" /></IconButton>
            </Stack>
            <Box sx={{ overflowY: "auto" }}>
                {jobs.map((job) => (
                    <Stack key={job.key} direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{job.itemName}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {job.quantity} {job.unit} · {formatCbm(jobSize(job))} m³{job.guessed ? " (guessed)" : ""} · {job.reference}
                                {job.serverStage === "to_accept" ? " · on the Remote Hub list" : " · waiting for a courier"}
                            </Typography>
                        </Box>
                        {job.urgent && <Chip size="small" color="error" label="Urgent" />}
                        <Button size="small" variant="contained" onClick={() => onTake(job.key)} sx={{ borderRadius: 999, fontWeight: 800, textTransform: "none" }}>Take</Button>
                    </Stack>
                ))}
                {jobs.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Nothing waiting here for the store.</Typography>
                )}
            </Box>
        </Paper>
    );
}
