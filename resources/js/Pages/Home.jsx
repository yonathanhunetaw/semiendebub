import React, { useEffect } from 'react';
import { Head } from '@inertiajs/react';

export default function Home({name}) {
    useEffect(() => {
        // 1. Create the script element
        const script = document.createElement('script');
        script.src = "https://unpkg.com/vconsole@latest/dist/vconsole.min.js";
        script.async = true;

        script.onload = () => {
            // 2. Initialize once the script is loaded
            if (window.VConsole) {
                window.vConsoleInstance = new window.VConsole();
                console.log("vConsole Loaded for Duka 1.3.0");
            }
        };

        document.body.appendChild(script);

        // 3. Cleanup: Remove vConsole when leaving this page
        return () => {
            if (window.vConsoleInstance) {
                window.vConsoleInstance.destroy();
            }
            document.body.removeChild(script);
        };
    }, []);

    return (
        <div className="p-10 min-h-screen bg-gray-50">
            <Head title="Duka 1.3.0" />
            
            <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
                <h1 className="text-4xl font-bold text-blue-600 underline mb-4">
                    Home - Duka 1.3.0
                </h1>
                <h1>Hello {name}</h1>
                
                <p className="text-slate-500 mb-6">
                    Inertia setup detected. vConsole is active only on this page.
                </p>

                <button 
                    onClick={() => console.log('Testing Duka 1.3.0 Log')}
                    className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition"
                >
                    Push to Console
                </button>
            </div>
        </div>
    );
}