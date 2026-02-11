import { Head, Link } from '@inertiajs/react';
//@ts-ignore
import { PageProps } from '@/types';
import { route } from 'ziggy-js';
import AppNavbar from "@/Components/AppNavbar";
import React from "react";

export default function Welcome({ auth }: PageProps) {
    const currentTime = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Addis_Ababa',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });

    return (
        <>

            <Head title="SumerianIO"/>


            {/* Pass the auth prop here */}
            <AppNavbar auth={auth} />

            <div className="bg-gray-50 text-black/50 dark:bg-black dark:text-white/50 antialiased font-sans">
                <div
                    className="relative min-h-screen flex flex-col items-center selection:bg-[#FF2D20] selection:text-white">
                    <div className="relative w-full max-w-2xl px-6 lg:max-w-7xl flex flex-col items-center">

                        {/* This replaces your <head> section from Blade */}
                        {/*<Head>*/}
                        {/*    <title>SumerianIO</title>*/}
                        {/*    <meta name="viewport" content="width=device-width, initial-scale=1"/>*/}
                        {/*    /!* Fonts are usually loaded in app.blade.php, but you can put them here too *!/*/}
                        {/*    <link rel="preconnect" href="https://fonts.bunny.net"/>*/}
                        {/*    <link href="https://fonts.bunny.net/css?family=figtree:400,600&display=swap"*/}
                        {/*          rel="stylesheet"/>*/}
                        {/*</Head>*/}

                        {/* 2. Header: Use min-h or a percentage so it doesn't push the navbar off-screen */}
                        <header className="flex items-center justify-center w-full min-h-[40vh] pt-10">
                            <h2 className="text-xl font-semibold dark:text-white">
                                Welcome to SumerianIO
                            </h2>
                        </header>

                        {/* 3. Main Content */}
                        <main className="flex-1 flex items-center justify-center w-full min-h-[40vh]">

                        </main>

                        {/* 4. Footer */}
                        <footer className="w-full bg-gray-800 text-white text-center p-4 mt-auto">
                            <p>Sumerian.com - {currentTime}</p>
                        </footer>
                    </div>
                </div>
            </div>
        </>
    );
}
