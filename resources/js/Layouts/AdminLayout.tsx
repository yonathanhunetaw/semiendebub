import React from 'react';
import AdminSidebar from '@/Components/Admin/AdminSidebar';
import { Link } from '@inertiajs/react';

interface Props {
    header?: React.ReactNode;
    children: React.ReactNode;
}

export default function AdminLayout({ header, children }: Props) {
    return (
        <div className="font-sans antialiased bg-gray-50 dark:bg-gray-900">
            {/* Navigation Bar */}
            <nav className="fixed top-0 z-50 w-full bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                <div className="px-3 py-3 lg:px-5 lg:pl-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <Link href="/" className="flex ms-2 md:me-24">
                                <span className="self-center text-xl font-semibold sm:text-2xl whitespace-nowrap dark:text-white">
                                    Mezgebe Dirijit
                                </span>
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            <AdminSidebar />

            {/* Main Content Area */}
            <main className="min-h-screen p-4 transition-all duration-300 ml-0 xl:ml-64">
                <div className="mt-16 min-h-screen rounded-lg border-2 border-dashed border-gray-200 p-2 dark:border-gray-700">
                    {header && (
                        <header className="bg-white shadow dark:bg-gray-800 mb-4 rounded-lg">
                            <div className="px-4 py-4 sm:px-6 lg:px-8">
                                {header}
                            </div>
                        </header>
                    )}

                    <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        {children}
                    </section>
                </div>
            </main>
        </div>
    );
}
