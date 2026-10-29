import React from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { identityFor } from "./identities";

/** "Abebe Kebede" -> "AK", "abebe" -> "A", nothing -> "?". */
export function initialsOf(name?: string | null): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    const letters = words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0];

    return letters.toUpperCase();
}

/**
 * A person as a rounded tile: their initials in the colour of the app they are
 * in, on a soft tint. Same family as AppIcon (an app) and quieter than the old
 * cartoon RoleAvatar, so people and apps read as one set.
 */
export default function UserAvatar({ name, role, size = 36, title }: { name?: string | null; role: string; size?: number; title?: string }) {
    const theme = useTheme();
    const tone = theme.palette[identityFor(role).color].main;

    return (
        <Box
            role="img"
            aria-label={title ?? name ?? "Account"}
            title={title}
            sx={{
                width: size,
                height: size,
                borderRadius: "30%",
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                bgcolor: alpha(tone, 0.16),
                color: tone,
                border: "1px solid",
                borderColor: alpha(tone, 0.3),
                fontWeight: 800,
                fontSize: Math.round(size * 0.38),
                letterSpacing: 0.3,
                userSelect: "none",
            }}
        >
            {initialsOf(name)}
        </Box>
    );
}
