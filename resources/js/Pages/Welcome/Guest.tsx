import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function GuestWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Welcome"/>
            <AppNavbar auth={auth}/>
            <div className="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Welcome</h1>
                        <p className="mt-2 text-gray-600">
                            Please sign in to continue.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
