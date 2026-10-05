import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { Html5QrcodeScanner } from "html5-qrcode";
import React from "react";

const READER_ID = "seller-barcode-reader";

/**
 * Camera barcode / QR scanner. Calls onScan with the decoded text and closes;
 * the caller decides what a scan means (the Store and Categories pages search
 * the catalogue for it). The scanner is created when the dialog opens and
 * torn down when it closes, so the camera is never left running.
 */
export default function BarcodeScannerDialog({
    open,
    onClose,
    onScan,
}: {
    open: boolean;
    onClose: () => void;
    onScan: (text: string) => void;
}): React.ReactElement {
    const onScanRef = React.useRef(onScan);
    onScanRef.current = onScan;

    React.useEffect(() => {
        if (!open) return;

        let scanner: Html5QrcodeScanner | null = null;
        // The reader <div> mounts with the dialog, one frame after `open`.
        const timer = window.setTimeout(() => {
            if (!document.getElementById(READER_ID)) return;
            scanner = new Html5QrcodeScanner(READER_ID, { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
            scanner.render(
                (decodedText) => {
                    const text = decodedText.trim();
                    if (text) onScanRef.current(text);
                },
                () => {
                    // Fires on every frame without a code; nothing to do.
                },
            );
        }, 100);

        return () => {
            window.clearTimeout(timer);
            scanner?.clear().catch(() => undefined);
        };
    }, [open]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Scan barcode</DialogTitle>
            <DialogContent>
                <div id={READER_ID} className="min-h-[300px] w-full" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}
