import { useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { Box, ChevronDown } from 'lucide-react';

export default function Sidebar() {
    const { url } = usePage();
    // Check if we are currently in a product-related route to keep it open by default
    const [isProductOpen, setIsProductOpen] = useState(url.startsWith('/admin/items'));

    const activeClass = "bg-primary-container text-on-primary-container";
    const inactiveClass = "text-on-surface-variant hover:bg-surface-container";

    return (
        <aside className="...">
            <div className="px-3 py-2">
                <ul className="space-y-2 font-medium">
                    <li>
                        <button 
                            onClick={() => setIsProductOpen(!isProductOpen)}
                            className="flex items-center w-full p-2 text-base text-on-surface transition duration-75 rounded-lg cursor-pointer hover:bg-surface-container"
                        >
                            <Box className="h-5 w-5 text-on-surface-variant" />
                            <span className="flex-1 text-left ms-3 whitespace-nowrap">Products</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${isProductOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <ul className={`${isProductOpen ? 'block' : 'hidden'} space-y-2 py-2`}>
                            <li className="pl-11">
                                <Link 
                                    href="/admin/items" 
                                    className={`flex w-full items-center rounded-lg p-2 ${url.includes('/admin/items') ? activeClass : inactiveClass}`}
                                >
                                    Items
                                </Link>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        </aside>
    );
}