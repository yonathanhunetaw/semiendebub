import React from "react";

/** The apps mark: three rows of three dots, in the current text colour. */
export default function NineDots({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={2} />))}
        </svg>
    );
}
