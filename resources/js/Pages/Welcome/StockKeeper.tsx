import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function StockKeeperWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Stock Keeper Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-cyan-50 text-cyan-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Stock Keeper Portal</h1>
                        <p className="mt-2 text-cyan-700">
                            Log in to manage inventory and stock movement.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
