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
        <div className="p-10 min-h-screen bg-background">
            <Head title="Duka 1.3.0" />
            
            <div className="max-w-md mx-auto bg-surface-container-lowest rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
                <h1 className="text-4xl font-bold text-primary underline mb-4">
                    Home - Duka 1.3.0
                </h1>
                <h1>Hello {name}</h1>
                
                <p className="text-on-surface-variant mb-6">
                    Inertia setup detected. vConsole is active only on this page.
                </p>

                <button 
                    onClick={() => console.log('Testing Duka 1.3.0 Log')}
                    className="bg-primary text-on-primary px-4 py-2 rounded shadow hover:bg-primary/90 transition"
                >
                    Push to Console
                </button>
            </div>
        </div>
    );
}