import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function FinanceWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Finance Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-blue-50 text-blue-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Finance Portal</h1>
                        <p className="mt-2 text-blue-700">
                            Sign in to access finance reports and tools.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
