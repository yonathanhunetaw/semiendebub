import { useState } from "react";
import { Head, Link } from "@inertiajs/react";
//@ts-ignore
import { PageProps } from "@/types";
import Globe from "@/Components/Globe";
import Navbar from '@/Components/WelcomeNavbar';
import WelcomeNavbar from "@/Components/WelcomeNavbar";

// pUt cUrsER iNside cUrly bRAcES AND pRESs sHIft + s -> fOR trIggeR suggEStION

// import {  } from "react";
// import {  } from "@inertiajs/react";
// import {  } from "@/types";
// import  from "@/Components/Globe";


// ---------------------------------------------------------------------------------------------
// 1. The "Big Three" (You'll use these 90% of the time)
// These are the most common things people "destructure" from React:

// useState: For storing data that changes (like a counter or form input).

// useEffect: For "side effects" like fetching data from an API or setting a timer.

// useContext: For sharing data globally across your app without passing props manually.

// ---------------------------------------------------------------------------------------------
// -----Without Destructuring-----:

// const inertia = { Head: "I am Head", Link: "I am Link" };

// const Head = inertia.Head;
// const Link = inertia.Link;

// -----With Destructuring-----:

// const { Head, Link } = { Head: "I am Head", Link: "I am Link" };

export default function Welcome({ auth }: PageProps) {
    // React State for Dropdowns
    const [cartOpen, setCartOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        /* ADDED pt-[72px] here to push everything down exactly 72px */
        <div className="relative flex flex-col min-h-screen overflow-hidden pt-[72px]">
            <Head title="Sumerian - Welcome" />

            {/* --- NAVBAR --- */}
            <WelcomeNavbar />

            {/* --- 3D BACKGROUND --- */}
            {/* Use absolute inset-0 to ensure it stays behind the pushed-down content */}
            <div className="absolute inset-0 z-0">
                <Globe />
            </div>

            {/* Overlay Text over the Globe (Optional) */}
            <div className="z-10 flex items-center justify-center py-20 pointer-events-none">
                <h1 className="px-6 py-4 text-5xl font-bold text-white shadow-2xl md:text-7xl bg-black/30 rounded-xl backdrop-blur-sm">
                    Welcome to Sumerian
                </h1>
            </div>

            <main className="relative z-20 px-6 pb-24 mx-auto max-w-7xl">
                {/* Section Header */}
                <div className="mb-16 text-center">
                    <h2 className="mb-4 font-serif text-3xl font-bold text-orange-200 md:text-5xl drop-shadow-md">
                        The Foundation of Commerce
                    </h2>
                    <p className="max-w-2xl mx-auto italic text-zinc-400">
                        "What was written on clay 5,000 years ago is now forged
                        in code. Manage your empire with the weight of history."
                    </p>
                </div>

                {/* The "Tablet" Grid */}
                <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
                    {/* Tablet 1: Ledger/Inventory */}
                    <div className="group relative bg-zinc-900/80 border-l-4 border-t-4 border-zinc-700 p-8 rounded-tr-3xl rounded-bl-3xl shadow-[10px_10px_0px_0px_rgba(39,39,42,1)] hover:translate-x-1 hover:-translate-y-1 transition-all duration-300 backdrop-blur-md">
                        <div className="absolute transition-opacity top-4 right-4 opacity-10 group-hover:opacity-30">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                        </div>
                        <h3 className="mb-3 text-xl font-bold tracking-widest text-orange-400 uppercase">
                            Inventory Ledger
                        </h3>
                        <p className="font-serif leading-relaxed text-zinc-400">
                            From grain silos to digital assets. Track every unit
                            with the precision of a Sumerian scribe. Real-time
                            stock alerts carved in digital stone.
                        </p>
                        <div className="pt-4 mt-6 font-mono text-xs border-t border-zinc-800 text-zinc-600">
                            DOCUMENT_REF: UR-NAMMU-2026
                        </div>
                    </div>

                    {/* Tablet 2: Logistics/Trade */}
                    <div className="group relative bg-zinc-900/80 border-l-4 border-t-4 border-zinc-700 p-8 rounded-tr-3xl rounded-bl-3xl shadow-[10px_10px_0px_0px_rgba(39,39,42,1)] hover:translate-x-1 hover:-translate-y-1 transition-all duration-300 backdrop-blur-md">
                        <h3 className="mb-3 text-xl font-bold tracking-widest text-orange-400 uppercase">
                            Trade Routes
                        </h3>
                        <p className="font-serif leading-relaxed text-zinc-400">
                            Manage shipments across the Fertile Crescent or the
                            Global Market. Logistics automation that connects
                            your suppliers and merchants instantly.
                        </p>
                        <div className="pt-4 mt-6 font-mono text-xs border-t border-zinc-800 text-zinc-600">
                            ENSI_VALIDATED: TRUE
                        </div>
                    </div>

                    {/* Tablet 3: Governance/ERP */}
                    <div className="group relative bg-zinc-900/80 border-l-4 border-t-4 border-zinc-700 p-8 rounded-tr-3xl rounded-bl-3xl shadow-[10px_10px_0px_0px_rgba(39,39,42,1)] hover:translate-x-1 hover:-translate-y-1 transition-all duration-300 backdrop-blur-md">
                        <h3 className="mb-3 text-xl font-bold tracking-widest text-orange-400 uppercase">
                            Imperial Governance
                        </h3>
                        <p className="font-serif leading-relaxed text-zinc-400">
                            Full-suite ERP. Human resources, payroll, and tax
                            compliance—modernized for the ambitious
                            merchant-king. Control your enterprise from one
                            seat.
                        </p>
                        <div className="pt-4 mt-6 font-mono text-xs border-t border-zinc-800 text-zinc-600">
                            STAMP: ROYAL_SEAL_01
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
