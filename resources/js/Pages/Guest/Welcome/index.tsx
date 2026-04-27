import { useState } from "react";
import { Head, Link } from "@inertiajs/react";
//@ts-ignore
import { PageProps } from "@/types";
import Globe from "@/Components/Globe";
import WelcomeNavbar from "@/Components/WelcomeNavbar";
import WelcomeFooter from "@/Components/WelcomeFooter";
// import Nani from "@/Components/Nani";

export default function Welcome({ auth }: PageProps) {
    return (
        <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-zinc-950 pt-[72px]">
            <Head>
                <title>Semien Debub - Imperial Commerce</title>
                {/* Option 1: Account Balance in your Bronze color (#c05800) */}
                <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23c05800%22><path d=%22M4 10h3v7H4zm6.5 0h3v7h-3zM2 19h20v3H2zm15-9h3v7h-3zm-5-9L2 6v2h20V6z%22/></svg>" />
            </Head>

            <WelcomeNavbar />

            {/* --- HERO SECTION --- */}
            <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
                {/* 3D Globe Background */}
                <div className="absolute inset-0 z-0">
                    <Globe />
                    {/* VIGNETTE/OVERLAY: This separates the navbar/text from the 3D globe */}
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 via-transparent to-zinc-950" />
                </div>

                <div className="z-10 px-4 text-center">
                    <h1 className="mb-6 text-6xl font-extrabold tracking-tighter text-white md:text-8xl drop-shadow-2xl">
                        SEMIEN <span className="text-orange-500">DEBUB</span>
                    </h1>
                    <p className="max-w-xl p-4 mx-auto text-lg rounded-lg text-zinc-300 md:text-xl backdrop-blur-sm bg-black/20">
                        The world's first digital ledger for the modern merchant-king.
                        Legacy meets high-performance logistics.
                    </p>
                </div>
            </section>

            {/* <Nani /> */}

            {/* --- MAIN CONTENT (SCROLLABLE) --- */}
            <main className="relative z-20 px-6 py-24 mx-auto max-w-7xl">

                {/* Intro Section */}
                <div className="mb-24 text-center">
                    <h2 className="mb-6 font-serif text-4xl font-bold text-orange-200 md:text-6xl">
                        The Foundation of Commerce
                    </h2>
                    <p className="max-w-3xl mx-auto text-xl italic text-zinc-400">
                        "What was written on clay 5,000 years ago is now forged
                        in code. Manage your empire with the weight of history."
                    </p>
                </div>

                {/* The "Tablet" Grid */}
                <div className="grid grid-cols-1 gap-12 mb-32 md:grid-cols-3">
                    <FeatureCard
                        title="Inventory Ledger"
                        refNum="UR-NAMMU-2026"
                        desc="From grain silos to digital assets. Track every unit with the precision of a Sumerian scribe."
                    />
                    <FeatureCard
                        title="Trade Routes"
                        refNum="ENSI_VALIDATED"
                        desc="Manage shipments across the Fertile Crescent or the Global Market with real-time automation."
                    />
                    <FeatureCard
                        title="Imperial Governance"
                        refNum="ROYAL_SEAL_01"
                        desc="Full-suite ERP. Human resources, payroll, and compliance modernized for ambitious merchants."
                    />
                </div>

                {/* ADDED SECTION: Long-form content to trigger scrolling */}
                <div className="grid items-center grid-cols-1 gap-20 mb-32 md:grid-cols-2">
                    <div className="space-y-6">
                        <h3 className="text-3xl font-bold text-white">Forged in Digital Bronze</h3>
                        <p className="leading-relaxed text-zinc-400">
                            Our architecture isn't just built for today; it's designed for the next era of commerce.
                            By combining high-throughput database structures with intuitive merchant interfaces,
                            Semien Debub provides a level of stability previously reserved for empires.
                        </p>
                        <ul className="space-y-4 font-mono text-sm text-orange-200/80">
                            <li>▷ 99.99% Uptime (Imperial Guarantee)</li>
                            <li>▷ End-to-end Encrypted Ledgers</li>
                            <li>▷ Multi-Warehouse Synchronization</li>
                        </ul>
                    </div>
                    <div className="flex items-center justify-center h-64 italic border bg-zinc-900 border-zinc-800 rounded-3xl text-zinc-700">
                        [ Interactive Data Visualization Placeholder ]
                    </div>
                </div>
            </main>

            <WelcomeFooter />


        </div>
    );
}

/* Helper Component for the Grid Items to keep code clean */
function FeatureCard({ title, desc, refNum }: { title: string, desc: string, refNum: string }) {
    return (
        <div className="relative p-8 transition-all duration-500 border group bg-zinc-900/60 border-zinc-800 rounded-2xl hover:border-orange-500/50 backdrop-blur-md">
            <h3 className="mb-3 text-xl font-bold tracking-widest text-orange-400 uppercase">
                {title}
            </h3>
            <p className="font-serif leading-relaxed text-zinc-400">
                {desc}
            </p>
            <div className="pt-4 mt-6 font-mono text-[10px] border-t border-zinc-800 text-zinc-600">
                REF: {refNum}
            </div>
        </div>
    );
}
