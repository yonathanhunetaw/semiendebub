import {Head} from '@inertiajs/react';
import AppNavbar from '@/Components/Navigation/Global/AppNavbar';
import React from 'react';
// @ts-ignore
import {PageProps} from '@/types';

export default function DevWelcome({auth}: PageProps) {
    return (
        <>
            <Head title="Dev Portal"/>
            <AppNavbar auth={auth}/>
            <div className="bg-violet-50 text-violet-900 min-h-screen flex flex-col">
                <main className="flex-1 flex items-center justify-center px-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold">Dev Portal</h1>
                        <p className="mt-2 text-violet-700">
                            Sign in to access developer tools and lessons.
                        </p>
                    </div>
                </main>
            </div>
        </>
    );
}
