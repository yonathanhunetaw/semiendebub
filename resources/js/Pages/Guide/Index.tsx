import React, { useEffect, useMemo, useState } from "react";
import { Head, Link, usePage } from "@inertiajs/react";
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SkipNextRounded from "@mui/icons-material/SkipNextRounded";
import SkipPreviousRounded from "@mui/icons-material/SkipPreviousRounded";
import AdminLayout from "@/Layouts/AdminLayout";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import SellerLayout from "@/Layouts/SellerLayout";
import StockKeeperLayout from "@/Layouts/StockKeeperLayout";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import RoleFigure from "@/Components/Visual/RoleFigure";
import { identityFor } from "@/Components/Visual/identities";
import { arrive, motionSafe } from "@/Components/Visual/motion";
import GuideStage from "@/Components/Guide/GuideStage";
import { CHAPTERS, DEFAULT_CHAPTER, type GuideApp, type GuideLink } from "@/Components/Guide/chapters";

/**
 * The guide: every way of working in Duka, told step by step by the person
 * who does it. One page for every app; each page's "How this works" button
 * opens it at the matching step, and each step's button opens the real page.
 */

interface Props {
    app: GuideApp;
    chapter?: string | null;
    step?: string | null;
}

const STEP_MS = 7000;

const APP_OF_ROUTE: Array<[string, string]> = [
    ["seller.", "Seller app"],
    ["stock_keeper.", "Stock keeper app"],
    ["delivery.", "Delivery app"],
    ["admin.", "Admin"],
    ["store.", "Admin"],
    ["inventory.", "Admin"],
];

function resolveLink(link: GuideLink | undefined, activeStoreId: number | "all" | undefined): string | null {
    if (!link) return null;
    try {
        if (link.needsStore) {
            return typeof activeStoreId === "number" ? route(link.route, activeStoreId) : route("inventory.index");
        }
        return route(link.route, link.params ?? {});
    } catch {
        return null;
    }
}

export default function GuideIndex({ app, chapter, step }: Props) {
    const theme = useTheme();
    const { props } = usePage<{ activeStore?: { id: number | "all" } | null }>();

    const initialChapter = CHAPTERS.find((c) => c.key === chapter) ?? CHAPTERS.find((c) => c.key === DEFAULT_CHAPTER[app]) ?? CHAPTERS[0];
    const [chapterKey, setChapterKey] = useState(initialChapter.key);
    const current = CHAPTERS.find((c) => c.key === chapterKey) ?? CHAPTERS[0];
    const [index, setIndex] = useState(() => Math.max(0, initialChapter.steps.findIndex((s) => s.key === step)));
    const [playing, setPlaying] = useState(!step);

    const active = current.steps[Math.min(index, current.steps.length - 1)];
    const narrator = active.who[0] ?? current.narrator;
    const href = resolveLink(active.link, props.activeStore?.id);
    const otherApp = active.link ? APP_OF_ROUTE.find(([prefix]) => active.link!.route.startsWith(prefix))?.[1] : undefined;
    const ownAppLabel = app === "admin" ? "Admin" : app === "seller" ? "Seller app" : app === "stock_keeper" ? "Stock keeper app" : "Delivery app";

    // Walk the chapter on its own until someone takes over.
    useEffect(() => {
        if (!playing) return;
        const timer = window.setTimeout(() => setIndex((i) => (i + 1) % current.steps.length), STEP_MS);
        return () => window.clearTimeout(timer);
    }, [playing, index, current.steps.length]);

    // Keep the address in step, so a link can open this exact step.
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("chapter", current.key);
        url.searchParams.set("step", active.key);
        window.history.replaceState(window.history.state, "", url.toString());
    }, [current.key, active.key]);

    const choose = (stepIndex: number) => {
        setPlaying(false);
        setIndex(stepIndex);
    };
    const chooseChapter = (key: string) => {
        setChapterKey(key);
        setIndex(0);
        setPlaying(true);
    };

    const grouped = useMemo(() => {
        const groups: Array<{ title: string | null; steps: Array<{ step: (typeof current.steps)[number]; i: number }> }> = [];
        current.steps.forEach((s, i) => {
            const title = s.group ?? null;
            const last = groups[groups.length - 1];
            if (last && last.title === title) last.steps.push({ step: s, i });
            else groups.push({ title, steps: [{ step: s, i }] });
        });
        return groups;
    }, [current]);

    return (
        <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: app === "admin" ? 0 : 1.5, sm: 0 }, py: { xs: app === "admin" ? 0 : 2, sm: 0 }, display: "flex", flexDirection: "column", gap: { xs: 2, sm: 3 }, ...motionSafe }}>
            <Head title="Guide" />

            <Box>
                <Typography sx={{ fontSize: { xs: "1.5rem", sm: "1.9rem" }, fontWeight: 900 }}>How Duka works</Typography>
                <Typography color="text.secondary">Pick a way of working. Each step is told by the person who does it; press the button to go and do it.</Typography>
            </Box>

            {/* Chapters */}
            <Box sx={{ display: "flex", gap: 1.25, overflowX: "auto", pb: 0.5, mx: { xs: -1.5, sm: 0 }, px: { xs: 1.5, sm: 0 }, "&::-webkit-scrollbar": { display: "none" } }}>
                {CHAPTERS.map((c) => {
                    const selected = c.key === current.key;
                    return (
                        <Paper key={c.key} component="button" type="button" onClick={() => chooseChapter(c.key)} elevation={0}
                            sx={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 1.25, p: 1.25, pr: 2, borderRadius: 999, cursor: "pointer", font: "inherit", textAlign: "left",
                                border: "2px solid", borderColor: selected ? "primary.main" : "divider", bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : "background.paper", color: "text.primary",
                                transition: "border-color .2s, background-color .2s" }}>
                            <RoleAvatar role={c.narrator} size={40} working={selected} />
                            <Box>
                                <Typography sx={{ fontWeight: 800, fontSize: "0.9rem", lineHeight: 1.2 }}>{c.title}</Typography>
                                <Typography variant="caption" color="text.secondary">{c.steps.length} steps</Typography>
                            </Box>
                        </Paper>
                    );
                })}
            </Box>

            {/* The stage: the narrator, what they say, and what it looks like */}
            <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 5, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>
                    {current.title} · Step {index + 1} of {current.steps.length}{active.group ? ` · ${active.group}` : ""}
                </Typography>
                <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" }, fontWeight: 900, mb: 2 }}>{active.title}</Typography>

                <Box key={`${current.key}-${active.key}`} sx={{ display: "grid", gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 5fr) minmax(0, 7fr)" }, alignItems: "center", animation: `${arrive} .4s ease-out both` }}>
                    {/* Narrator + speech bubble */}
                    <Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="flex-end">
                        <Box sx={{ display: { xs: "none", sm: "block" } }}><RoleFigure role={narrator} action="talk" height={220} /></Box>
                        <Box sx={{ display: { xs: "block", sm: "none" } }}><RoleFigure role={narrator} action="talk" height={140} /></Box>
                        <Box sx={{ position: "relative", flex: 1, mb: { xs: 2, sm: 6 }, p: 2, borderRadius: 4, bgcolor: alpha(theme.palette[identityFor(narrator).color].main, 0.1), border: "2px solid", borderColor: alpha(theme.palette[identityFor(narrator).color].main, 0.35),
                            "&::before": { content: '""', position: "absolute", left: -10, bottom: 18, width: 16, height: 16, transform: "rotate(45deg)", bgcolor: "background.paper", borderLeft: "2px solid", borderBottom: "2px solid", borderColor: alpha(theme.palette[identityFor(narrator).color].main, 0.35) } }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: `${identityFor(narrator).color}.main`, textTransform: "uppercase", letterSpacing: 0.6 }}>
                                {identityFor(narrator).label}
                            </Typography>
                            <Typography sx={{ fontSize: { xs: "0.95rem", sm: "1.05rem" }, lineHeight: 1.5, fontWeight: 500 }}>“{active.say}”</Typography>
                        </Box>
                    </Stack>

                    <Box sx={{ minWidth: 0, p: { xs: 1, sm: 2 }, borderRadius: 4, bgcolor: "action.hover" }}>
                        <GuideStage stage={active.stage} />
                    </Box>
                </Box>

                {/* Who can do it, controls, and the way to the real page */}
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} justifyContent="space-between" sx={{ mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block", mb: 0.75 }}>WHO CAN DO THIS</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {active.who.map((role) => (
                                <Chip key={role} avatar={<Box component="span" sx={{ display: "inline-flex" }}><RoleAvatar role={role} size={26} /></Box>}
                                    label={identityFor(role).label} variant="outlined" sx={{ height: 34, borderRadius: 999, fontWeight: 700, "& .MuiChip-avatar": { width: 26, height: 26, ml: 0.5 } }} />
                            ))}
                        </Stack>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: "space-between", md: "flex-end" }}>
                        <Stack direction="row" spacing={0.25}>
                            <Tooltip title="Previous step"><span><IconButton onClick={() => choose(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous step"><SkipPreviousRounded /></IconButton></span></Tooltip>
                            <Tooltip title={playing ? "Pause" : "Play the chapter"}><IconButton color="primary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? <PauseRounded /> : <PlayArrowRounded />}</IconButton></Tooltip>
                            <Tooltip title="Next step"><span><IconButton onClick={() => choose(Math.min(current.steps.length - 1, index + 1))} disabled={index === current.steps.length - 1} aria-label="Next step"><SkipNextRounded /></IconButton></span></Tooltip>
                        </Stack>
                        {href && active.link && (
                            <Button component={otherApp && otherApp !== ownAppLabel ? "a" : Link} href={href} variant="contained" endIcon={<ArrowForwardRounded />}
                                sx={{ borderRadius: 999, fontWeight: 800, px: 2.5, height: 44, whiteSpace: "nowrap" }}>
                                {active.link.label}
                                {otherApp && otherApp !== ownAppLabel && (
                                    <Box component="span" sx={{ ml: 1, px: 0.75, py: 0.1, borderRadius: 1, fontSize: "0.65rem", bgcolor: alpha(theme.palette.common.white, 0.2) }}>{otherApp}</Box>
                                )}
                            </Button>
                        )}
                    </Stack>
                </Stack>
            </Paper>

            {/* Every step: click one to hear it */}
            <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 4, border: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 800, px: 1, mb: 1 }}>{current.title}: {current.blurb}</Typography>
                {grouped.map((group) => (
                    <Box key={group.title ?? "all"} sx={{ mb: 1 }}>
                        {group.title && <Typography variant="overline" sx={{ px: 1, color: "text.secondary", fontWeight: 800 }}>{group.title}</Typography>}
                        {group.steps.map(({ step: s, i }) => {
                            const isCurrent = i === index;
                            const done = i < index;
                            return (
                                <Box key={s.key} component="button" type="button" onClick={() => choose(i)}
                                    sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1.5, p: 1, borderRadius: 3, border: "none", font: "inherit", textAlign: "left", cursor: "pointer", color: "text.primary",
                                        bgcolor: isCurrent ? alpha(theme.palette.primary.main, 0.1) : "transparent", "&:hover": { bgcolor: isCurrent ? alpha(theme.palette.primary.main, 0.14) : "action.hover" } }}>
                                    <Box sx={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.8rem",
                                        bgcolor: isCurrent ? "primary.main" : done ? "success.main" : "action.selected", color: isCurrent || done ? "primary.contrastText" : "text.primary" }}>
                                        {done ? <CheckRounded sx={{ fontSize: 16 }} /> : i + 1}
                                    </Box>
                                    <Typography sx={{ flex: 1, minWidth: 0, fontWeight: isCurrent ? 800 : 600, fontSize: "0.9rem" }}>{s.title}</Typography>
                                    <Stack direction="row" spacing={-0.75}>
                                        {s.who.slice(0, 3).map((role) => <RoleAvatar key={role} role={role} size={26} />)}
                                    </Stack>
                                </Box>
                            );
                        })}
                    </Box>
                ))}
            </Paper>
        </Box>
    );
}

const LAYOUTS: Record<GuideApp, React.ComponentType<{ children: React.ReactNode }>> = {
    admin: AdminLayout,
    seller: SellerLayout,
    stock_keeper: StockKeeperLayout,
    delivery: DeliveryLayout,
};

/** The guide wears the chrome of the app it was opened from. */
GuideIndex.layout = (page: React.ReactElement<Props>) => {
    const Layout = LAYOUTS[page.props.app] ?? AdminLayout;
    return <Layout>{page}</Layout>;
};
