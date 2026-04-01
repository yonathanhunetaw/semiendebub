import React, { useState } from "react";
import { Head, Link } from "@inertiajs/react";
//@ts-ignore
import { PageProps } from "@/types";
import Globe from "@/Components/Globe"; // Adjust path if needed

export default function Welcome({ auth }: PageProps) {
    // React State for Dropdowns
    const [cartOpen, setCartOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="relative flex flex-col min-h-screen overflow-hidden">
            <Head title="Sumerian - Welcome" />
            {/* --- NAVBAR --- */}
            <nav className="z-50 antialiased border-b border-gray-200 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md dark:border-gray-700">
                <div className="max-w-screen-xl px-4 py-4 mx-auto 2xl:px-0">
                    <div className="flex items-center justify-between">
                        {/* Logo & Main Links */}
                        <div className="flex items-center space-x-8">
                            <div className="shrink-0">
                                <Link
                                    href="/"
                                    className="flex items-center gap-2"
                                >
                                    <span className="self-center text-xl font-bold text-orange-600 sm:text-2xl whitespace-nowrap dark:text-orange-500">
                                        Sumerian
                                    </span>
                                </Link>
                            </div>

                            <ul className="items-center justify-start hidden gap-6 py-3 lg:flex md:gap-8 sm:justify-center">
                                <li>
                                    <Link
                                        href="/"
                                        className="text-sm font-medium text-gray-900 hover:text-orange-600 dark:text-white"
                                    >
                                        Home
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="#"
                                        className="text-sm font-medium text-gray-900 hover:text-orange-600 dark:text-white"
                                    >
                                        Features
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="#"
                                        className="text-sm font-medium text-gray-900 hover:text-orange-600 dark:text-white"
                                    >
                                        Offers
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="#"
                                        className="text-sm font-medium text-gray-900 hover:text-orange-600 dark:text-white"
                                    >
                                        Demo
                                    </Link>
                                </li>
                            </ul>
                        </div>

                        {/* Right Side Actions */}
                        <div className="relative flex items-center lg:space-x-2">
                            {/* Cart Button */}
                            <button
                                onClick={() => setCartOpen(!cartOpen)}
                                className="inline-flex items-center p-2 text-sm font-medium text-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                            >
                                <svg
                                    className="w-5 h-5 lg:me-1"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                                    />
                                </svg>
                                <span className="hidden sm:flex">My Cart</span>
                            </button>

                            {/* Cart Dropdown */}
                            {/* {cartOpen && (
                                <div className="absolute z-50 p-4 space-y-4 bg-white border border-gray-100 rounded-lg shadow-xl top-12 right-16 w-80 dark:bg-gray-800 dark:border-gray-700">
                                    <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                                        Your cart is currently empty.
                                    </p>
                                    <Link
                                        href="#"
                                        className="flex w-full justify-center rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700"
                                    >
                                        Continue Shopping
                                    </Link>
                                </div>
                            )} */}

                            {/* User Account Button */}
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="inline-flex items-center p-2 ml-2 text-sm font-medium text-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                            >
                                <svg
                                    className="w-5 h-5 me-1"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                    />
                                </svg>
                                Account
                            </button>

                            {/* User Dropdown */}
                            {userMenuOpen && (
                                <div className="absolute right-0 z-50 w-56 overflow-hidden bg-white border border-gray-100 rounded-lg shadow-xl top-12 dark:bg-gray-700 dark:border-gray-600">
                                    <ul className="p-2 text-sm font-medium text-gray-900 dark:text-white">
                                        {auth.user ? (
                                            <>
                                                <li>
                                                    <Link
                                                        href="/dashboard"
                                                        className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                                    >
                                                        Dashboard
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/profile"
                                                        className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                                    >
                                                        Profile
                                                    </Link>
                                                </li>
                                                <li className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-600">
                                                    <Link
                                                        href="/logout"
                                                        method="post"
                                                        as="button"
                                                        className="block w-full px-3 py-2 text-left text-red-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-red-400"
                                                    >
                                                        Sign Out
                                                    </Link>
                                                </li>
                                            </>
                                        ) : (
                                            <>
                                                <li>
                                                    <Link
                                                        href="/login"
                                                        className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                                    >
                                                        Log in
                                                    </Link>
                                                </li>
                                                <li>
                                                    <Link
                                                        href="/register"
                                                        className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                                                    >
                                                        Register
                                                    </Link>
                                                </li>
                                            </>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {/* Mobile Menu Toggle */}
                            <button
                                onClick={() =>
                                    setMobileMenuOpen(!mobileMenuOpen)
                                }
                                className="inline-flex items-center justify-center p-2 ml-2 text-gray-900 rounded-md lg:hidden hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4 6h16M4 12h16M4 18h16"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Mobile Menu Expanded */}
                    {mobileMenuOpen && (
                        <div className="px-4 py-3 mt-4 border border-gray-200 rounded-lg lg:hidden bg-gray-50 dark:border-gray-600 dark:bg-gray-700">
                            <ul className="space-y-3 text-sm font-medium text-gray-900 dark:text-white">
                                <li>
                                    <Link href="/">Home</Link>
                                </li>
                                <li>
                                    <Link href="#">Features</Link>
                                </li>
                                <li>
                                    <Link href="#">Offers</Link>
                                </li>
                                                                <li>
                                    <Link href="#">Demo</Link>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>
            </nav>
            {/* --- 3D BACKGROUND --- */}
            {/* The globe sits behind everything taking up the full screen */}
            <Globe />
            {/* Overlay Text over the Globe (Optional) */}
            <div className="z-10 flex items-center justify-center flex-1 pointer-events-none">
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
                            {/* Ancient-style Icon or Cuneiform SVG */}
                            <svg
                                width="40"
                                height="40"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                            >
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
