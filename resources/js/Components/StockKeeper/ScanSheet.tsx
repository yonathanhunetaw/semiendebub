import { Html5QrcodeScanner } from "html5-qrcode";
import React from "react";

const READER_ID = "sk-scan-reader";

/**
 * Scan a barcode with the camera, or with a USB / Bluetooth scanner (they type
 * the code and press Enter into the box, which has focus), or type a SKU.
 *
 * `continuous` keeps the sheet open between scans (stocktakes), ignoring the
 * same code read again within 1.5 s; otherwise it closes after one code.
 * Bottom sheet on phones, centred dialog from sm.
 */
export default function ScanSheet({
    open,
    onClose,
    onCode,
    title = "Scan a barcode",
    hint = "Point the camera at a barcode, use a scanner, or type a SKU.",
    continuous = false,
    children,
}: {
    open: boolean;
    onClose: () => void;
    onCode: (code: string) => void;
    title?: string;
    hint?: string;
    continuous?: boolean;
    /** Shown under the camera, e.g. the last line counted. */
    children?: React.ReactNode;
}): React.ReactElement | null {
    const [typed, setTyped] = React.useState("");
    const [camera, setCamera] = React.useState(true);
    const onCodeRef = React.useRef(onCode);
    onCodeRef.current = onCode;
    const last = React.useRef<{ code: string; at: number } | null>(null);

    const emit = React.useCallback(
        (raw: string) => {
            const code = raw.trim();
            if (!code) return;
            const now = Date.now();
            if (last.current && last.current.code === code && now - last.current.at < 1500) return;
            last.current = { code, at: now };
            onCodeRef.current(code);
            if (!continuous) onClose();
        },
        [continuous, onClose],
    );

    React.useEffect(() => {
        if (!open || !camera) return;

        let scanner: Html5QrcodeScanner | null = null;
        // The reader <div> mounts with the sheet, one frame after `open`.
        const timer = window.setTimeout(() => {
            if (!document.getElementById(READER_ID)) return;
            scanner = new Html5QrcodeScanner(READER_ID, { fps: 10, qrbox: { width: 260, height: 160 }, rememberLastUsedCamera: true }, false);
            scanner.render(
                (text) => emit(text),
                () => {
                    // Fires on every frame without a code; nothing to do.
                },
            );
        }, 100);

        return () => {
            window.clearTimeout(timer);
            scanner?.clear().catch(() => undefined);
        };
    }, [open, camera, emit]);

    React.useEffect(() => {
        if (!open) return;
        const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-on-surface/50" />
            <div className="relative max-h-[94vh] w-full overflow-y-auto rounded-t-[24px] border border-outline-variant bg-surface-container-lowest p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[520px] sm:rounded-[24px] sm:p-5">
                <div className="mx-auto mb-3 h-1 w-10 rounded-[999px] bg-outline-variant sm:hidden" />
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-on-surface">
                            <span className="material-symbols-outlined text-[22px] text-primary">barcode_scanner</span>
                            {title}
                        </h2>
                        <p className="mt-0.5 text-[13px] text-on-surface-variant">{hint}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded-[10px] p-1.5 text-on-surface-variant hover:bg-surface-container">
                        <span className="material-symbols-outlined text-[22px]">close</span>
                    </button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        emit(typed);
                        setTyped("");
                    }}
                    className="mb-3 flex gap-2"
                >
                    <label className="flex flex-1 items-center gap-2 rounded-[12px] border border-outline-variant bg-surface-container-low px-3 focus-within:border-primary">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">keyboard</span>
                        <input
                            autoFocus
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder="Barcode or SKU"
                            aria-label="Barcode or SKU"
                            autoComplete="off"
                            className="w-full border-0 bg-transparent px-0 py-2.5 font-mono text-[15px] focus:ring-0"
                        />
                    </label>
                    <button type="submit" className="rounded-[12px] bg-primary px-4 text-[14px] font-bold text-on-primary">
                        Go
                    </button>
                </form>

                {camera ? (
                    <div className="overflow-hidden rounded-[16px] border border-outline-variant bg-surface-container-low">
                        <div id={READER_ID} className="min-h-[260px] w-full" />
                    </div>
                ) : null}
                <button type="button" onClick={() => setCamera((on) => !on)} className="mt-2 flex items-center gap-1 text-[13px] font-bold text-primary">
                    <span className="material-symbols-outlined text-[18px]">{camera ? "videocam_off" : "photo_camera"}</span>
                    {camera ? "Turn the camera off (using a scanner)" : "Use the camera"}
                </button>

                {children}
            </div>
        </div>
    );
}
