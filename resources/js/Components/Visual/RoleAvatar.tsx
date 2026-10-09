import React from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { identityFor, type Prop } from "./identities";
import { bob, motionSafe } from "./motion";

/**
 * A role as a person: a round badge in the role's colour with a character
 * wearing the role's outfit and holding its prop. `working` makes them bob,
 * for the one doing the current step.
 */
export default function RoleAvatar({
    role,
    size = 40,
    working = false,
    muted = false,
    title,
}: {
    role: string;
    size?: number;
    working?: boolean;
    muted?: boolean;
    title?: string;
}) {
    const theme = useTheme();
    const identity = identityFor(role);
    const tone = theme.palette[identity.color].main;
    const color = muted ? alpha(theme.palette.text.secondary, 0.45) : tone;
    const paper = theme.palette.background.paper;
    // Outline and accents from the theme; only skin and hair are fixed tones.
    const ink = theme.palette.grey[900];
    const gold = theme.palette.warning.main;
    const card = theme.palette.warning.dark;
    const slate = theme.palette.grey[700];

    const prop: Record<Prop, React.ReactNode> = {
        crown: <path d="M22 13 L25 7 L29 11 L32 5 L35 11 L39 7 L42 13 Z" fill={gold} stroke={ink} strokeWidth="1" strokeLinejoin="round" />,
        key: <g><circle cx="46" cy="44" r="4" fill="none" stroke={gold} strokeWidth="2.5" /><path d="M49 47 L55 53 M52 50 L54 48" stroke={gold} strokeWidth="2.5" strokeLinecap="round" /></g>,
        apron: <path d="M25 40 H39 V58 H25 Z M25 40 L22 34 M39 40 L42 34" fill={paper} stroke={ink} strokeWidth="1" opacity="0.95" />,
        bag: <g><path d="M42 42 H56 L54 58 H44 Z" fill={gold} stroke={ink} strokeWidth="1" /><path d="M46 42 Q49 36 52 42" fill="none" stroke={ink} strokeWidth="1.5" /></g>,
        box: <g><rect x="40" y="42" width="14" height="12" fill={card} stroke={ink} strokeWidth="1" /><path d="M40 46 H54 M47 42 V46" stroke={ink} strokeWidth="1" /></g>,
        cap: <path d="M20 20 Q32 8 44 20 L48 21 Q44 23 20 21 Z" fill={color} stroke={ink} strokeWidth="1" />,
        coin: <g><circle cx="48" cy="48" r="7" fill={gold} stroke={ink} strokeWidth="1" /><text x="48" y="51" textAnchor="middle" fontSize="8" fontWeight="800" fill={ink} fontFamily="Inter, sans-serif">ብ</text></g>,
        clipboard: <g><rect x="41" y="40" width="13" height="16" rx="1.5" fill={paper} stroke={ink} strokeWidth="1" /><path d="M44 45 H51 M44 49 H51 M44 53 H49" stroke={ink} strokeWidth="1" /></g>,
        crate: <g><rect x="40" y="42" width="15" height="13" fill={card} stroke={ink} strokeWidth="1" /><path d="M40 42 L55 55 M55 42 L40 55" stroke={ink} strokeWidth="1" /></g>,
        megaphone: <path d="M40 46 L52 40 V56 L40 50 Z M40 46 V50" fill={gold} stroke={ink} strokeWidth="1" strokeLinejoin="round" />,
        laptop: <g><rect x="40" y="43" width="15" height="10" rx="1" fill={slate} stroke={ink} strokeWidth="1" /><rect x="38" y="53" width="19" height="2.5" rx="1" fill={theme.palette.grey[400]} /></g>,
        link: <path d="M43 50 a4 4 0 0 1 0-6 l3-3 a4 4 0 0 1 6 6 M52 46 a4 4 0 0 1 0 6 l-3 3 a4 4 0 0 1-6-6" fill="none" stroke={gold} strokeWidth="2.2" strokeLinecap="round" />,
    };

    return (
        <Box
            component="span"
            title={title ?? identity.label}
            sx={{
                display: "inline-grid",
                placeItems: "center",
                width: size,
                height: size,
                borderRadius: "50%",
                bgcolor: alpha(color, 0.16),
                border: "2px solid",
                borderColor: color,
                overflow: "hidden",
                flexShrink: 0,
                animation: working ? `${bob} 1.6s ease-in-out infinite` : "none",
                ...motionSafe,
            }}
        >
            <Box component="svg" viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label={identity.label} sx={{ display: "block", opacity: muted ? 0.55 : 1 }}>
                {/* body in the role colour */}
                <path d="M12 64 Q12 40 32 40 Q52 40 52 64 Z" fill={color} />
                {/* neck, head, hair */}
                <rect x="28" y="33" width="8" height="8" fill={identity.skin} />
                <circle cx="32" cy="25" r="11" fill={identity.skin} />
                <path d="M21 24 Q21 12 32 12 Q43 12 43 24 Q38 18 32 18 Q26 18 21 24 Z" fill={identity.hair} />
                <circle cx="28" cy="26" r="1.3" fill={ink} />
                <circle cx="36" cy="26" r="1.3" fill={ink} />
                <path d="M28.5 30.5 Q32 33 35.5 30.5" fill="none" stroke={ink} strokeWidth="1.2" strokeLinecap="round" />
                {prop[identity.prop]}
            </Box>
        </Box>
    );
}
