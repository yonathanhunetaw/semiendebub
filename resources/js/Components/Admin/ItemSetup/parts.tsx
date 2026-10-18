import * as React from "react";
import { Box, Card, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";

import type { Check, Part } from "@/types/itemSetup";

export const cardSx = { borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "none", p: 2 } as const;

/** done ÷ (required + optional done), the same rule as App\Services\Item\ItemReadiness::percent. */
export function percentOf(checks: Check[]): number {
    const required = checks.filter((c) => c.required);
    const optionalDone = checks.filter((c) => !c.required && c.done);
    const denominator = required.length + optionalDone.length;
    if (denominator === 0) return 0;

    return Math.round((100 * (required.filter((c) => c.done).length + optionalDone.length)) / denominator);
}

export const colourOf = (percent: number): "success" | "warning" | "error" => (percent >= 100 ? "success" : percent >= 50 ? "warning" : "error");

/** The checks of one part, required first; optional ones are marked and never count against it. */
export function ChecksList({ checks, only }: { checks: Check[]; only?: string[] }) {
    const shown = checks.filter((c) => !only || only.includes(c.key)).sort((a, b) => Number(b.required) - Number(a.required));

    return (
        <Stack spacing={0.5}>
            {shown.map((c) => (
                <Stack key={c.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    {c.done ? <CheckCircleRounded fontSize="small" color="success" /> : <RadioButtonUncheckedRounded fontSize="small" color={c.required ? "error" : "disabled"} />}
                    <Typography variant="body2" sx={{ flex: 1 }} color={c.done ? "text.primary" : "text.secondary"}>
                        {c.label}
                        {c.detail ? <Typography component="span" variant="caption" color="text.secondary"> · {c.detail}</Typography> : null}
                    </Typography>
                    {!c.required && <Chip size="small" variant="outlined" label={c.done ? "extra, done" : "optional"} />}
                </Stack>
            ))}
        </Stack>
    );
}

/** A section card with its own title, progress and anchor for the sticky header. */
export function Section({ id, title, hint, checks, only, children }: { id: string; title: string; hint?: string; checks?: Check[]; only?: string[]; children: React.ReactNode }) {
    const own = checks?.filter((c) => !only || only.includes(c.key)) ?? [];
    const percent = own.length > 0 ? percentOf(own) : null;

    return (
        <Card id={id} data-section={id} sx={{ ...cardSx, scrollMarginTop: 150 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "1.05rem", flex: 1 }}>{title}</Typography>
                {percent !== null && <Chip size="small" color={colourOf(percent)} label={`${percent}%`} />}
            </Stack>
            {hint && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {hint}
                </Typography>
            )}
            {percent !== null && <LinearProgress variant="determinate" value={percent} color={colourOf(percent)} sx={{ height: 6, borderRadius: 3, mb: 1.5 }} />}
            {own.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <ChecksList checks={own} />
                </Box>
            )}
            {children}
        </Card>
    );
}

export type { Part };
