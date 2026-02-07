import { Link, usePage } from '@inertiajs/react';
import { Menu } from 'lucide-react';

export default function Navigation() {
    const { auth } = usePage().props as any; // Get user from global props

    return (
        <nav className="fixed top-0 z-50 w-full bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <div className="px-3 py-3 lg:px-5 lg:pl-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center justify-start">
                        <button className="p-2 text-gray-500 rounded-lg xl:hidden hover:bg-gray-100">
                            <Menu className="w-6 h-6" />
                        </button>
                        <Link href="/admin/dashboard" className="flex ms-2 md:me-24">
                            <img src="https://flowbite.com/docs/images/logo.svg" className="h-8 me-3" alt="Logo" />
                            <span className="self-center text-xl font-semibold dark:text-white">Mezgebe Dirijit</span>
                        </Link>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium dark:text-white">{auth.user.first_name}</p>
                            <p className="text-xs text-gray-500">{auth.user.email}</p>
                        </div>
                        <Link 
                            href="/logout" 
                            method="post" 
                            as="button" 
                            className="px-4 py-2 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                        >
                            Sign out
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
}
