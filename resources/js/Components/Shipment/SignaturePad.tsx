import { Box, Button, Stack, Typography } from "@mui/material";
import React from "react";

interface Props {
    /** Called with a PNG data URL once something is drawn, or null when cleared. */
    onChange: (dataUrl: string | null) => void;
    height?: number;
}

/**
 * A finger-or-mouse signature box.
 *
 * Ink is always black on white so the saved PNG reads the same in light and
 * dark mode, wherever it is shown later. Drawn at device pixel ratio so the
 * line stays crisp on a phone.
 */
export default function SignaturePad({ onChange, height = 180 }: Props): React.ReactElement {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const drawing = React.useRef(false);
    const last = React.useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = React.useState(true);

    const reset = React.useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = window.devicePixelRatio || 1;
        const { width } = canvas.getBoundingClientRect();
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(ratio, ratio);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#111111";
        setEmpty(true);
        onChange(null);
    }, [height, onChange]);

    React.useEffect(() => {
        reset();
        // Only on mount: resizing mid-signature would wipe the ink.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        last.current = point(event);
    };

    const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current || !last.current) return;
        const ctx = event.currentTarget.getContext("2d");
        if (!ctx) return;
        const next = point(event);
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
        last.current = next;
        if (empty) setEmpty(false);
    };

    const end = () => {
        if (!drawing.current) return;
        drawing.current = false;
        last.current = null;
        if (!empty && canvasRef.current) {
            onChange(canvasRef.current.toDataURL("image/png"));
        }
    };

    return (
        <Stack spacing={1}>
            <Box
                sx={{
                    position: "relative",
                    borderRadius: 2,
                    border: "1.5px dashed",
                    borderColor: empty ? "divider" : "primary.main",
                    overflow: "hidden",
                    bgcolor: "#fff",
                    touchAction: "none",
                }}
            >
                <Box
                    component="canvas"
                    ref={canvasRef}
                    onPointerDown={start}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerLeave={end}
                    sx={{ display: "block", width: "100%", height, cursor: "crosshair" }}
                />
                {empty ? (
                    <Typography
                        variant="body2"
                        sx={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            color: "#9e9e9e",
                            pointerEvents: "none",
                        }}
                    >
                        Sign here
                    </Typography>
                ) : null}
                <Box
                    sx={{
                        position: "absolute",
                        left: 16,
                        right: 16,
                        bottom: 28,
                        borderBottom: "1px solid #e0e0e0",
                        pointerEvents: "none",
                    }}
                />
            </Box>
            <Stack direction="row" justifyContent="flex-end">
                <Button size="small" onClick={reset} disabled={empty}>
                    Clear
                </Button>
            </Stack>
        </Stack>
    );
}
