import QrImage from "@/Components/Work/QrImage";
import { ghostBtn, primaryBtn, workLayout, wr } from "@/Components/Work/workUi";
import type { WorkApp } from "@/types/work";
import { Head, Link, router } from "@inertiajs/react";
import React from "react";

/**
 * The QR to print and stick at the counter. It opens the site only (whoever
 * holds the key scans it in the morning); clocking in uses the counter
 * screen's moving code. Make a new one if this paper leaks: the old one stops.
 */

interface Props {
    app: WorkApp;
    site: { id: number; name: string; kind_label: string };
    url: string;
    version: number;
}

export default function PrintedQr({ app, site, url, version }: Props): React.ReactElement {
    return (
        <>
            <Head title={`QR · ${site.name}`} />

            <div className="flex min-h-screen flex-col items-center bg-surface-container-low px-4 pb-36 pt-6 text-center">
                <div className="rounded-[16px] bg-white p-6 shadow-sm print:shadow-none">
                    <p className="text-[18px] font-extrabold text-black">{site.name}</p>
                    <p className="text-[12px] text-black/70">Scan with your phone camera to open the site</p>
                    <QrImage value={url} size={320} className="mx-auto mt-4" />
                    <p className="mt-2 text-[10px] text-black/50">Version {version}</p>
                </div>

                <div className="mt-5 flex gap-2 print:hidden">
                    <button type="button" className={primaryBtn} onClick={() => window.print()}>
                        Print
                    </button>
                    <button
                        type="button"
                        className={ghostBtn}
                        onClick={() => router.post(wr(app, "work.sites.reprint", site.id), {}, { preserveScroll: true })}
                    >
                        Make a new one (voids this)
                    </button>
                </div>
                <Link href={wr(app, "work.sites.show", site.id)} className="mt-6 text-[12px] font-bold text-primary print:hidden">
                    Back to {site.name}
                </Link>
            </div>
        </>
    );
}

PrintedQr.layout = workLayout;
