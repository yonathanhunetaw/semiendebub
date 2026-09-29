import React, { useState, useEffect } from 'react';
import { Head, Link } from '@inertiajs/react';
import { Home, Settings, User, Package, ShoppingCart, BarChart2, Bell, HelpCircle, LogOut, Menu, X, Layers } from 'lucide-react';

export default function HomePage({ auth }) {
    const [isOpen, setIsOpen] = useState(false);

    // Isolated vConsole for debugging this specific page
    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://unpkg.com/vconsole@latest/dist/vconsole.min.js";
        script.async = true;
        script.onload = () => { if (window.VConsole) new window.VConsole(); };
        document.body.appendChild(script);
        return () => {
            document.querySelectorAll('.vc-switch').forEach(el => el.remove()); // Cleanup vConsole UI
            document.body.removeChild(script);
        };
    }, []);

    const menuItems = [
        { name: 'Dashboard', icon: <Home size={20} />, href: '/dashboard' },
        { name: 'Products', icon: <Package size={20} />, href: '#' },
        { name: 'Orders', icon: <ShoppingCart size={20} />, href: '#' },
        { name: 'Analytics', icon: <BarChart2 size={20} />, href: '#' },
        { name: 'Inventory', icon: <Layers size={20} />, href: '#' },
        { name: 'Customers', icon: <User size={20} />, href: '#' },
        { name: 'Notifications', icon: <Bell size={20} />, href: '#' },
        { name: 'Settings', icon: <Settings size={20} />, href: '#' },
        { name: 'Support', icon: <HelpCircle size={20} />, href: '#' },
        { name: 'Logout', icon: <LogOut size={20} />, href: '/logout' },
    ];

    return (
        <div className="flex min-h-screen bg-gray-100">
            <Head title="Duka - Home" />

            {/* Mobile Hamburger Button */}
            <div className="lg:hidden fixed top-4 left-4 z-50">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="p-2 bg-blue-600 text-white rounded-md shadow-lg"
                >
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* AdminSidebar Overlay (Mobile) */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* AdminSidebar Container */}
            <aside className={`
                fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out
                lg:translate-x-0 lg:static lg:inset-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex items-center justify-center h-20 border-b">
                    <h2 className="text-2xl font-bold text-blue-600">Duka 1.3.0</h2>
                </div>

                <nav className="mt-6 px-4 space-y-2 overflow-y-auto">
                    {menuItems.map((item, index) => (
                        <Link
                            key={index}
                            href={item.href}
                            className="flex items-center p-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors group"
                        >
                            <span className="mr-3 text-gray-400 group-hover:text-blue-600">{item.icon}</span>
                            <span className="font-medium">{item.name}</span>
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8">
                <div className="max-w-4xl mx-auto">
                    <header className="mb-8">
                        <h1 className="text-4xl font-bold text-gray-800 underline decoration-blue-600 decoration-4 underline-offset-8">
                            HomePage - Duka 1.3.0
                        </h1>
                        <p className="mt-4 text-gray-600">Welcome back, {auth.user.name}!</p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
                            <h3 className="font-semibold text-lg mb-2">System Status</h3>
                            <p className="text-green-500 font-mono text-sm">● Debugger Active (vConsole)</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
