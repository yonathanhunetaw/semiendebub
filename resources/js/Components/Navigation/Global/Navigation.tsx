import { Link, usePage } from '@inertiajs/react';
import { Menu } from 'lucide-react';

export default function Navigation() {
    const { auth } = usePage().props as any; // Get user from global props

    return (
        <nav className="fixed top-0 z-50 w-full bg-surface-container-lowest border-b border-outline-variant">
            <div className="px-3 py-3 lg:px-5 lg:pl-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center justify-start">
                        <button className="p-2 text-on-surface-variant rounded-lg xl:hidden hover:bg-surface-container">
                            <Menu className="w-6 h-6" />
                        </button>
                        <Link href="/admin/dashboard" className="flex ms-2 md:me-24">
                            <img src="https://flowbite.com/docs/images/logo.svg" className="h-8 me-3" alt="Logo" />
                            <span className="self-center text-xl font-semibold text-on-surface">Mezgebe Dirijit</span>
                        </Link>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium text-on-surface">{auth.user.first_name}</p>
                            <p className="text-xs text-on-surface-variant">{auth.user.email}</p>
                        </div>
                        <Link 
                            href="/logout" 
                            method="post" 
                            as="button" 
                            className="px-4 py-2 text-xs text-on-error bg-error rounded-md hover:bg-error/90"
                        >
                            Sign out
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
}
