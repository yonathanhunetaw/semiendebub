import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function AdminWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Admin Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Admin Portal</h1>
                        <p className="mt-2 text-slate-600">
                            Sign in with an admin account to manage the system.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
