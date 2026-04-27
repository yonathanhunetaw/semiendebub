import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function VendorWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Vendor Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-orange-50 text-orange-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Vendor Portal</h1>
                        <p className="mt-2 text-orange-700">
                            Sign in to manage vendor products and listings.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
