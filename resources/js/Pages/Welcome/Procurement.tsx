import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function ProcurementWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Procurement Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-indigo-50 text-indigo-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Procurement Portal</h1>
                        <p className="mt-2 text-indigo-700">
                            Sign in to manage purchase orders and suppliers.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
