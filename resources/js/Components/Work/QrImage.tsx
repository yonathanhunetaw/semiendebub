import QRCode from "qrcode";
import React, { useEffect, useState } from "react";

/** A QR code for a URL, drawn in the browser (the `qrcode` package). */
export default function QrImage({ value, size = 280, className = "" }: { value: string; size?: number; className?: string }): React.ReactElement {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })
            .then((url) => alive && setSrc(url))
            .catch(() => alive && setSrc(null));
        return () => {
            alive = false;
        };
    }, [value, size]);

    return src ? (
        <img src={src} width={size} height={size} alt="QR code" className={`rounded-[12px] bg-white ${className}`} />
    ) : (
        <div className={`animate-pulse rounded-[12px] bg-surface-container ${className}`} style={{ width: size, height: size }} />
    );
}
