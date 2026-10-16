import React from "react";
import { Head } from "@inertiajs/react";
import SharedCartLayout from "@/Layouts/SharedCartLayout";

/** An unknown, revoked or expired link: one page for all, so a link reveals nothing. */
export default function SharedCartGone() {
    return (
        <>
            <Head title="Link not available" />
            <div className="rounded-[20px] border border-outline-variant bg-surface-container-lowest px-5 py-10 text-center shadow-sm">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/50">link_off</span>
                <h1 className="mt-2 text-[20px] font-extrabold">This link no longer works</h1>
                <p className="mt-1 text-[14px] text-on-surface-variant">It may have expired or been replaced. Ask your seller to send you a new one.</p>
            </div>
        </>
    );
}

SharedCartGone.layout = (page: React.ReactNode) => <SharedCartLayout>{page}</SharedCartLayout>;
