import React from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

/**
 * Places and things, drawn flat on a 64×64 grid from the theme's colours, so
 * they follow the role theme and work in light and dark mode.
 */

export type SceneKind = "store" | "warehouse" | "shelf" | "cart" | "pay" | "paid" | "parcel" | "truck" | "home" | "hub";

interface SceneProps {
    kind: SceneKind;
    size?: number;
    /** Greys the scene out (a stage not reached yet). */
    muted?: boolean;
    title?: string;
}

function usePalette(muted: boolean) {
    const theme = useTheme();
    const p = theme.palette;
    const pick = (color: string) => (muted ? alpha(p.text.secondary, 0.35) : color);

    return {
        primary: pick(p.primary.main),
        primarySoft: muted ? alpha(p.text.secondary, 0.12) : alpha(p.primary.main, 0.16),
        success: pick(p.success.main),
        warning: pick(p.warning.main),
        info: pick(p.info.main),
        error: pick(p.error.main),
        ink: muted ? alpha(p.text.secondary, 0.5) : p.text.primary,
        paper: p.background.paper,
        line: muted ? alpha(p.text.secondary, 0.25) : alpha(p.text.primary, 0.18),
        ground: muted ? alpha(p.text.secondary, 0.08) : alpha(p.text.primary, 0.06),
    };
}

export default function Scene({ kind, size = 56, muted = false, title }: SceneProps) {
    const c = usePalette(muted);

    const body: Record<SceneKind, React.ReactNode> = {
        store: (
            <>
                <rect x="8" y="26" width="48" height="30" rx="3" fill={c.paper} stroke={c.ink} strokeWidth="2" />
                {/* striped awning */}
                <path d="M6 26 L10 14 H54 L58 26 Z" fill={c.primary} />
                {[14, 26, 38, 50].map((x) => (
                    <path key={x} d={`M${x - 4} 26 L${x - 2} 14 H${x + 2} L${x + 4} 26 Z`} fill={c.paper} opacity="0.85" />
                ))}
                <path d="M6 26 Q10 31 14 26 Q18 31 22 26 Q26 31 30 26 Q34 31 38 26 Q42 31 46 26 Q50 31 54 26 Q58 31 58 26" fill="none" stroke={c.primary} strokeWidth="2" />
                <rect x="14" y="36" width="16" height="12" rx="1.5" fill={c.primarySoft} stroke={c.ink} strokeWidth="1.5" />
                <rect x="36" y="36" width="12" height="20" rx="1.5" fill={c.primary} />
                <circle cx="45" cy="47" r="1.2" fill={c.paper} />
            </>
        ),
        warehouse: (
            <>
                <path d="M6 28 L32 12 L58 28 V56 H6 Z" fill={c.paper} stroke={c.ink} strokeWidth="2" strokeLinejoin="round" />
                <path d="M6 28 L32 12 L58 28" fill="none" stroke={c.primary} strokeWidth="4" strokeLinejoin="round" />
                <rect x="16" y="34" width="32" height="22" fill={c.primarySoft} stroke={c.ink} strokeWidth="1.5" />
                {[39, 44, 49].map((y) => (
                    <line key={y} x1="16" x2="48" y1={y} y2={y} stroke={c.line} strokeWidth="1.5" />
                ))}
                <rect x="20" y="46" width="9" height="10" fill={c.warning} />
                <rect x="31" y="46" width="9" height="10" fill={c.primary} />
                <rect x="25" y="38" width="9" height="8" fill={c.success} />
            </>
        ),
        hub: (
            <>
                <rect x="6" y="22" width="52" height="34" rx="3" fill={c.paper} stroke={c.ink} strokeWidth="2" />
                <rect x="6" y="16" width="52" height="8" rx="2" fill={c.primary} />
                {[12, 26, 40].map((x) => (
                    <rect key={x} x={x} y="30" width="12" height="26" fill={c.primarySoft} stroke={c.ink} strokeWidth="1.2" />
                ))}
                <rect x="14" y="44" width="8" height="8" fill={c.warning} />
                <rect x="42" y="40" width="8" height="12" fill={c.success} />
            </>
        ),
        shelf: (
            <>
                <rect x="10" y="8" width="44" height="48" rx="2" fill={c.paper} stroke={c.ink} strokeWidth="2" />
                {[22, 36, 50].map((y) => (
                    <line key={y} x1="10" x2="54" y1={y} y2={y} stroke={c.ink} strokeWidth="2" />
                ))}
                <rect x="14" y="12" width="8" height="10" rx="1" fill={c.primary} />
                <rect x="24" y="14" width="8" height="8" rx="1" fill={c.warning} />
                <rect x="36" y="11" width="12" height="11" rx="1" fill={c.success} />
                <rect x="14" y="27" width="14" height="9" rx="1" fill={c.info} />
                <rect x="32" y="26" width="8" height="10" rx="1" fill={c.primary} />
                <rect x="18" y="41" width="10" height="9" rx="1" fill={c.success} />
                <rect x="34" y="42" width="14" height="8" rx="1" fill={c.warning} />
            </>
        ),
        cart: (
            <>
                <path d="M6 12 H14 L20 42 H50 L56 20 H17" fill="none" stroke={c.ink} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <rect x="22" y="22" width="10" height="12" rx="1.5" fill={c.primary} />
                <rect x="34" y="18" width="10" height="16" rx="1.5" fill={c.warning} />
                <rect x="44" y="25" width="7" height="9" rx="1.5" fill={c.success} />
                <circle cx="24" cy="50" r="4.5" fill={c.paper} stroke={c.ink} strokeWidth="3" />
                <circle cx="46" cy="50" r="4.5" fill={c.paper} stroke={c.ink} strokeWidth="3" />
            </>
        ),
        pay: (
            <>
                <rect x="8" y="16" width="40" height="28" rx="4" fill={c.primary} />
                <rect x="8" y="22" width="40" height="5" fill={c.ink} opacity="0.35" />
                <rect x="13" y="33" width="14" height="4" rx="2" fill={c.paper} opacity="0.85" />
                <circle cx="46" cy="44" r="12" fill={c.warning} stroke={c.paper} strokeWidth="2" />
                <text x="46" y="48.5" textAnchor="middle" fontSize="12" fontWeight="800" fill={c.paper} fontFamily="Inter, sans-serif">ብር</text>
            </>
        ),
        paid: (
            <>
                <path d="M14 6 H50 V58 L45 54 L40 58 L35 54 L30 58 L25 54 L20 58 L14 54 Z" fill={c.paper} stroke={c.ink} strokeWidth="2" strokeLinejoin="round" />
                {[16, 22, 28].map((y) => (
                    <line key={y} x1="20" x2={y === 28 ? 34 : 44} y1={y} y2={y} stroke={c.line} strokeWidth="2.5" strokeLinecap="round" />
                ))}
                <circle cx="32" cy="42" r="9" fill={c.success} />
                <path d="M27.5 42 L31 45.5 L37 38.5" fill="none" stroke={c.paper} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </>
        ),
        parcel: (
            <>
                <path d="M32 8 L56 20 V46 L32 58 L8 46 V20 Z" fill={c.warning} stroke={c.ink} strokeWidth="2" strokeLinejoin="round" />
                <path d="M8 20 L32 32 L56 20 M32 32 V58" fill="none" stroke={c.ink} strokeWidth="2" strokeLinejoin="round" />
                <path d="M20 14 L44 26 V34" fill="none" stroke={c.paper} strokeWidth="4" strokeLinejoin="round" opacity="0.8" />
            </>
        ),
        truck: (
            <>
                <rect x="4" y="18" width="34" height="26" rx="2" fill={c.primary} />
                <path d="M38 26 H50 L58 36 V44 H38 Z" fill={c.paper} stroke={c.ink} strokeWidth="2" strokeLinejoin="round" />
                <path d="M42 29 H49 L54 36 H42 Z" fill={c.primarySoft} />
                <rect x="10" y="24" width="10" height="9" rx="1" fill={c.warning} />
                <rect x="22" y="26" width="10" height="7" rx="1" fill={c.paper} opacity="0.75" />
                <circle cx="16" cy="47" r="5" fill={c.ink} />
                <circle cx="16" cy="47" r="2" fill={c.paper} />
                <circle cx="48" cy="47" r="5" fill={c.ink} />
                <circle cx="48" cy="47" r="2" fill={c.paper} />
            </>
        ),
        home: (
            <>
                <path d="M8 30 L32 10 L56 30" fill="none" stroke={c.primary} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 26 V56 H50 V26" fill={c.paper} stroke={c.ink} strokeWidth="2" strokeLinejoin="round" />
                <rect x="27" y="38" width="10" height="18" rx="1.5" fill={c.primary} />
                <rect x="18" y="32" width="7" height="7" rx="1" fill={c.primarySoft} stroke={c.ink} strokeWidth="1.2" />
                <path d="M38 44 L48 39 L58 44 V52 L48 57 L38 52 Z" fill={c.warning} stroke={c.ink} strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="52" cy="22" r="7" fill={c.success} />
                <path d="M49 22 L51.5 24.5 L55.5 19.5" fill="none" stroke={c.paper} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </>
        ),
    };

    return (
        <Box component="svg" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title ?? kind} sx={{ display: "block", overflow: "visible", flexShrink: 0 }}>
            <ellipse cx="32" cy="59" rx="26" ry="3" fill={c.ground} />
            {body[kind]}
        </Box>
    );
}
