import { Head, Link } from '@inertiajs/react';
import { PageProps } from '@/types';

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
            {/* This replaces your <head> section from Blade */}
            <Head>
                <title>Sumerian</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {/* Fonts are usually loaded in app.blade.php, but you can put them here too */}
                <link rel="preconnect" href="https://fonts.bunny.net" />
                <link href="https://fonts.bunny.net/css?family=figtree:400,600&display=swap" rel="stylesheet" />
            </Head>

            <div className="bg-gray-50 text-black/50 dark:bg-black dark:text-white/50 antialiased font-sans">
                <div className="relative min-h-screen flex flex-col items-center justify-between selection:bg-[#FF2D20] selection:text-white">
                    <div className="relative w-full max-w-2xl px-6 lg:max-w-7xl flex flex-col items-center justify-center">

                        {/* Header Section */}
                        <header className="flex items-center justify-center w-full h-screen">
                            <h2 className="rounded-md px-3 py-2 text-black ring-1 ring-transparent transition hover:text-black/70 focus:outline-none dark:text-white dark:hover:text-white/80 text-xl font-semibold">
                                Welcome to Sumerian
                            </h2>
                        </header>

                        {/* Main Content (The Login/Register Navigation) */}
                        <main className="flex-1 flex items-center justify-center w-full h-screen">
                            <div className="flex justify-center items-center gap-2 py-10">
                                <nav className="-mx-3 flex flex-1 justify-end">
                                    {auth.user ? (
                                        <Link
                                            href={route('dashboard')}
                                            className="rounded-md px-3 py-2 text-black ring-1 ring-transparent transition hover:text-black/70 focus:outline-none dark:text-white"
                                        >
                                            Dashboard
                                        </Link>
                                    ) : (
                                        <>
                                            <Link
                                                href={route('login')}
                                                className="rounded-md px-3 py-2 text-black ring-1 ring-transparent transition hover:text-black/70 focus:outline-none dark:text-white"
                                            >
                                                Log in
                                            </Link>

                                            <Link
                                                href={route('register')}
                                                className="rounded-md px-3 py-2 text-black ring-1 ring-transparent transition hover:text-black/70 focus:outline-none dark:text-white"
                                            >
                                                Register
                                            </Link>
                                        </>
                                    )}
                                </nav>
                            </div>
                        </main>

                        {/* Footer Section */}
                        <footer className="w-full bg-gray-800 text-white text-center p-4 mt-auto">
                            <p>Sumerian.com - {currentTime}</p>
                        </footer>
                    </div>
                </div>
            </div>
        </>
    );
}
