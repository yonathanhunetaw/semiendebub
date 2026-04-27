import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function SellerWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Seller Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-emerald-50 text-emerald-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Seller Portal</h1>
                        <p className="mt-2 text-emerald-700">
                            Sign in to manage your store and orders.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
