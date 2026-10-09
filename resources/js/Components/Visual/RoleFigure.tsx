import React from "react";
import { Box } from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import { identityFor, type Prop } from "./identities";
import { motionSafe } from "./motion";

/**
 * A role as a whole person, head to toe, in the role's colour and with its
 * prop (identities.ts). The guide uses it to narrate: it breathes and blinks
 * while idle, talks and gestures while explaining, walks while carrying, and
 * waves or points. Limbs pivot at the shoulder and hip.
 */

export type FigureAction = "idle" | "talk" | "walk" | "wave" | "point";

const breathe = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
`;
const stepBob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;
const blink = keyframes`
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
`;
const talk = keyframes`
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
`;
const legA = keyframes`
  0%, 100% { transform: rotate(18deg); }
  50% { transform: rotate(-18deg); }
`;
const legB = keyframes`
  0%, 100% { transform: rotate(-18deg); }
  50% { transform: rotate(18deg); }
`;
const gesture = keyframes`
  0%, 100% { transform: rotate(-20deg); }
  50% { transform: rotate(-48deg); }
`;
const waveArm = keyframes`
  0%, 100% { transform: rotate(-150deg); }
  50% { transform: rotate(-115deg); }
`;

export default function RoleFigure({
    role,
    action = "idle",
    height = 200,
    title,
}: {
    role: string;
    action?: FigureAction;
    height?: number;
    title?: string;
}) {
    const theme = useTheme();
    const identity = identityFor(role);
    const tone = theme.palette[identity.color].main;
    const toneDark = theme.palette[identity.color].dark;
    const paper = theme.palette.background.paper;
    const ink = theme.palette.grey[900];
    const gold = theme.palette.warning.main;
    const pants = theme.palette.grey[800];
    const skin = identity.skin;

    const walking = action === "walk";
    const limb = { transformBox: "fill-box", transformOrigin: "50% 0%" } as const;

    // The right hand (viewer's right) carries the prop or gestures.
    const rightArm = (() => {
        switch (action) {
            case "talk":
                return { animation: `${gesture} 1.4s ease-in-out infinite` };
            case "wave":
                return { animation: `${waveArm} .7s ease-in-out infinite` };
            case "point":
                return { transform: "rotate(-75deg)" };
            case "walk":
                return { animation: `${legB} .7s ease-in-out infinite` };
            default:
                return { transform: "rotate(-6deg)" };
        }
    })();

    const handProp: Partial<Record<Prop, React.ReactNode>> = {
        box: <g><rect x="-11" y="-2" width="22" height="18" fill={theme.palette.warning.dark} stroke={ink} strokeWidth="1.2" /><path d="M-11 4 H11 M0 -2 V4" stroke={ink} strokeWidth="1.2" /></g>,
        bag: <g><path d="M-9 0 H9 L7 20 H-7 Z" fill={gold} stroke={ink} strokeWidth="1.2" /><path d="M-4 0 Q0 -8 4 0" fill="none" stroke={ink} strokeWidth="1.5" /></g>,
        coin: <g><circle cx="0" cy="6" r="8" fill={gold} stroke={ink} strokeWidth="1.2" /><text x="0" y="9.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={ink} fontFamily="Inter, sans-serif">ብ</text></g>,
        clipboard: <g><rect x="-8" y="-2" width="16" height="21" rx="2" fill={paper} stroke={ink} strokeWidth="1.2" /><path d="M-5 4 H5 M-5 8 H5 M-5 12 H3" stroke={ink} strokeWidth="1" /></g>,
        crate: <g><rect x="-11" y="-2" width="22" height="18" fill={theme.palette.warning.dark} stroke={ink} strokeWidth="1.2" /><path d="M-11 -2 L11 16 M11 -2 L-11 16" stroke={ink} strokeWidth="1" /></g>,
        megaphone: <path d="M-4 2 L12 -6 V14 L-4 6 Z" fill={gold} stroke={ink} strokeWidth="1.2" strokeLinejoin="round" />,
        laptop: <g><rect x="-11" y="0" width="22" height="14" rx="1.5" fill={theme.palette.grey[700]} stroke={ink} strokeWidth="1.2" /></g>,
        key: <g><circle cx="0" cy="4" r="4" fill="none" stroke={gold} strokeWidth="2.5" /><path d="M3 7 L9 14" stroke={gold} strokeWidth="2.5" strokeLinecap="round" /></g>,
        apron: <g><rect x="-6" y="0" width="12" height="18" rx="2" fill={theme.palette.grey[900]} /><rect x="-4.5" y="2" width="9" height="12" rx="1" fill={theme.palette.info.light} /></g>,
    };

    return (
        <Box
            component="svg"
            viewBox="0 0 120 220"
            height={height}
            width={(height * 120) / 220}
            role="img"
            aria-label={title ?? identity.label}
            sx={{ display: "block", overflow: "visible", flexShrink: 0, ...motionSafe }}
        >
            <ellipse cx="60" cy="214" rx={walking ? 26 : 30} ry="5" fill={alpha(theme.palette.text.primary, 0.12)} />

            <Box component="g" sx={{ animation: walking ? `${stepBob} .35s ease-in-out infinite` : `${breathe} 3s ease-in-out infinite` }}>
                {/* Legs and shoes */}
                <Box component="g" sx={{ ...limb, animation: walking ? `${legA} .7s ease-in-out infinite` : "none" }}>
                    <rect x="44" y="128" width="14" height="68" rx="6" fill={pants} />
                    <path d="M42 194 h18 a4 4 0 0 1 0 8 h-22 a4 4 0 0 1 4 -8 z" fill={ink} />
                </Box>
                <Box component="g" sx={{ ...limb, animation: walking ? `${legB} .7s ease-in-out infinite` : "none" }}>
                    <rect x="62" y="128" width="14" height="68" rx="6" fill={pants} />
                    <path d="M62 194 h18 a4 4 0 0 1 4 8 h-22 a4 4 0 0 1 0 -8 z" fill={ink} />
                </Box>

                {/* Left arm (viewer's left): swings when walking */}
                <Box component="g" sx={{ ...limb, animation: walking ? `${legA} .7s ease-in-out infinite` : "none", transform: walking ? undefined : "rotate(8deg)" }}>
                    <rect x="28" y="76" width="12" height="52" rx="6" fill={tone} />
                    <circle cx="34" cy="130" r="6.5" fill={skin} />
                </Box>

                {/* Torso */}
                <path d="M36 80 Q36 70 48 68 H72 Q84 70 84 80 L86 134 H34 Z" fill={tone} />
                <path d="M34 128 H86 V136 H34 Z" fill={toneDark} />
                {/* Outfit details by role */}
                {identity.prop === "crown" && <path d="M54 70 L60 82 L66 70 M60 82 L57 104 L60 110 L63 104 Z" fill={gold} stroke={ink} strokeWidth="1" />}
                {identity.prop === "apron" && <path d="M46 84 H74 V132 H46 Z M46 84 L42 72 M74 84 L78 72" fill={paper} stroke={ink} strokeWidth="1" opacity="0.95" />}
                {identity.prop === "box" && <g><rect x="36" y="96" width="48" height="6" fill={gold} /><rect x="36" y="112" width="48" height="6" fill={gold} /></g>}
                {identity.prop === "cap" && <path d="M40 76 L80 120" stroke={toneDark} strokeWidth="6" />}
                {identity.prop === "coin" && <path d="M56 70 L60 78 L64 70 M60 78 L58 98 L60 102 L62 98 Z" fill={theme.palette.grey[800]} />}
                {identity.prop === "key" && <rect x="48" y="90" width="24" height="12" rx="2" fill={paper} opacity="0.85" />}

                {/* Right arm: gestures, waves, points, or carries the prop */}
                <Box component="g" sx={{ ...limb, ...rightArm }}>
                    <rect x="80" y="76" width="12" height="52" rx="6" fill={tone} />
                    <circle cx="86" cy="130" r="6.5" fill={skin} />
                    {handProp[identity.prop] && <g transform="translate(86 132)">{handProp[identity.prop]}</g>}
                </Box>

                {/* Neck and head */}
                <rect x="54" y="56" width="12" height="14" fill={skin} />
                <circle cx="60" cy="42" r="21" fill={skin} />
                <path d="M39 40 Q39 18 60 18 Q81 18 81 40 Q73 30 60 30 Q47 30 39 40 Z" fill={identity.hair} />
                {identity.prop === "cap" && <path d="M38 33 Q60 10 82 33 L90 35 Q82 39 38 36 Z" fill={tone} stroke={ink} strokeWidth="1" />}
                {identity.prop === "crown" && <path d="M46 22 L50 12 L56 18 L60 8 L64 18 L70 12 L74 22 Z" fill={gold} stroke={ink} strokeWidth="1" strokeLinejoin="round" />}
                {/* Eyes blink, mouth talks */}
                <Box component="g" sx={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `${blink} 4s infinite` }}>
                    <circle cx="52" cy="43" r="2.3" fill={ink} />
                    <circle cx="68" cy="43" r="2.3" fill={ink} />
                </Box>
                <circle cx="47" cy="50" r="3" fill={alpha(theme.palette.error.main, 0.25)} />
                <circle cx="73" cy="50" r="3" fill={alpha(theme.palette.error.main, 0.25)} />
                {action === "talk" ? (
                    <Box component="ellipse" cx="60" cy="53" rx="5" ry="3.5" fill={ink} sx={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `${talk} .28s ease-in-out infinite` }} />
                ) : (
                    <path d="M54 51 Q60 56 66 51" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
                )}
            </Box>
        </Box>
    );
}
