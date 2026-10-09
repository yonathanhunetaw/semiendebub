import { keyframes } from "@mui/material/styles";

/**
 * The visual language's motion. Small, slow, purposeful: things bob while
 * someone is working on them, pulse where attention is needed, and travel
 * along a road when goods move. Every animation stops under
 * prefers-reduced-motion (see `motionSafe`).
 */

export const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;

export const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 var(--pulse-color); }
  70% { box-shadow: 0 0 0 12px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
`;

export const pop = keyframes`
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;

/** Dashes marching along a road or a track. */
export const march = keyframes`
  to { stroke-dashoffset: -24; }
`;

/** A vehicle driving across its road and back to the start, on a loop. */
export const drive = keyframes`
  0% { left: 0%; opacity: 0; }
  8% { opacity: 1; }
  85% { left: calc(100% - var(--vehicle-size)); opacity: 1; }
  100% { left: calc(100% - var(--vehicle-size)); opacity: 0; }
`;

export const wheel = keyframes`
  to { transform: rotate(360deg); }
`;

export const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

/** Stops every animation in the subtree for people who asked for less motion. */
export const motionSafe = {
    "@media (prefers-reduced-motion: reduce)": {
        "&, & *": { animation: "none !important", transition: "none !important" },
    },
} as const;

/** Dashed road made of a repeating background, sliding along its length. */
export const slideX = keyframes`
  from { background-position: 0 0; }
  to { background-position: 24px 0; }
`;

export const slideY = keyframes`
  from { background-position: 0 0; }
  to { background-position: 0 24px; }
`;

/** A page arriving: a short rise and fade. */
export const arrive = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`;
