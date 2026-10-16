import React from "react";
import { Box, ButtonBase, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import { hhmm, type WorldEvent } from "./events";
import { placeFor } from "./places";
import { PARTY_LABEL, PHASE_LABEL, stateAt, type WorldShipment } from "./replay";

/**
 * One shipment as of the timeline's moment: the four ticks, then every
 * event it left, with who did it and where (greyed until it has happened).
 * A tap on an event jumps the timeline there.
 */
export default function ShipmentCard({ shipment, time, events, currentKey, onEvent, onClose }: {
    shipment: WorldShipment;
    time: number;
    events: WorldEvent[];
    currentKey: string | null;
    onEvent: (event: WorldEvent) => void;
    onClose: () => void;
}) {
    const theme = useTheme();
    const state = stateAt(shipment, time);
    const done = (iso: string | null) => iso !== null && Date.parse(iso) <= time;

    return (
        <Paper elevation={6} sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 2, borderRadius: 4, borderTop: "4px solid", borderTopColor: "warning.main", bgcolor: alpha(theme.palette.background.paper, 0.97) }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", lineHeight: 1.2 }}>{shipment.reference}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                        {shipment.origin.name ?? "?"} → {shipment.destination.name ?? "?"}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Close"><CloseRounded fontSize="small" /></IconButton>
            </Stack>

            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                <Chip size="small" color="warning" label={PHASE_LABEL[state.phase]} sx={{ fontWeight: 800 }} />
                {shipment.items > 0 && <Chip size="small" variant="outlined" label={`${shipment.items} lines · ${shipment.cbm} m³`} />}
                {shipment.vehicle && <Chip size="small" variant="outlined" label={shipment.vehicle} />}
                {shipment.courier && <Chip size="small" variant="outlined" label={`Driver: ${shipment.courier}`} />}
            </Stack>

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1.5 }}>The four ticks · {state.ticks}/4</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                {shipment.parties.map((p) => {
                    const ticked = p.status === "accepted" && done(p.at);
                    return (
                        <Stack key={p.party} direction="row" spacing={0.75} alignItems="center"
                            sx={{ p: 0.75, borderRadius: 2, bgcolor: ticked ? alpha(theme.palette.success.main, 0.12) : "action.hover" }}>
                            {ticked ? <CheckCircleRounded color="success" fontSize="small" /> : <RadioButtonUncheckedRounded color="disabled" fontSize="small" />}
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.1 }}>{PARTY_LABEL[p.party]}</Typography>
                                <Typography variant="caption" color="text.secondary">{ticked && p.at ? clock(p.at) : "waiting"}</Typography>
                            </Box>
                        </Stack>
                    );
                })}
            </Box>

            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, display: "block", mt: 1.5 }}>What happened</Typography>
            <Stack spacing={0.25}>
                {events.map((e) => {
                    const happened = e.at <= time;
                    const isCurrent = e.key === currentKey;
                    return (
                        <ButtonBase key={e.key} onClick={() => onEvent(e)}
                            sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.5, borderRadius: 2, textAlign: "left", opacity: happened ? 1 : 0.45,
                                bgcolor: isCurrent ? alpha(theme.palette.warning.main, 0.16) : "transparent", "&:hover": { bgcolor: "action.hover" } }}>
                            {happened ? <CheckCircleRounded color={e.bad ? "error" : "success"} sx={{ fontSize: 16 }} /> : <RadioButtonUncheckedRounded color="disabled" sx={{ fontSize: 16 }} />}
                            <RoleAvatar role={e.who} size={22} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: isCurrent ? 900 : happened ? 700 : 500, lineHeight: 1.25 }}>{e.what}</Typography>
                                {e.where && <Typography variant="caption" color="text.secondary">{placeFor(e.where).label}</Typography>}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>{hhmm(e.at)}</Typography>
                        </ButtonBase>
                    );
                })}
            </Stack>
        </Paper>
    );
}

/** "14:05" in the viewer's time zone. */
export function clock(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
