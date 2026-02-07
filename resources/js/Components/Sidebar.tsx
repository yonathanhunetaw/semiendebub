import { useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { Box, ChevronDown } from 'lucide-react';

export default function Sidebar() {
    const { url } = usePage();
    // Check if we are currently in a product-related route to keep it open by default
    const [isProductOpen, setIsProductOpen] = useState(url.startsWith('/admin/items'));

    const activeClass = "bg-orange-100 dark:bg-orange-700 dark:text-white";
    const inactiveClass = "hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400";

    return (
        <aside className="...">
            <div className="px-3 py-2">
                <ul className="space-y-2 font-medium">
                    <li>
                        <button 
                            onClick={() => setIsProductOpen(!isProductOpen)}
                            className="flex items-center w-full p-2 text-base text-gray-900 transition duration-75 rounded-lg cursor-pointer dark:text-white hover:bg-gray-100"
                        >
                            <Box className="h-5 w-5 text-gray-500" />
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