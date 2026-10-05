import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function SharedWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Shared Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-primary-container text-on-primary-container min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Shared Portal</h1>
                        <p className="mt-2 text-primary">
                            Log in to access shared tools and resources.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
