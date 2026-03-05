import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function MarketingWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Marketing Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-rose-50 text-rose-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Marketing Portal</h1>
                        <p className="mt-2 text-rose-700">
                            Log in to manage campaigns and promotions.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
