import {Link} from '@inertiajs/react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
            <div className="text-center">
                {/* Visual element */}
                <h1 className="text-9xl font-bold text-indigo-600">404</h1>

                <h2 className="mt-4 text-3xl font-bold text-gray-900 tracking-tight sm:text-5xl">
                    Page not found
                </h2>

                <p className="mt-6 text-base leading-7 text-gray-600">
                    Sorry, we couldn’t find the page you’re looking for.
                    It might have been moved or the subdomain is incorrect.
                </p>

                <div className="mt-10 flex items-center justify-center gap-x-6">
                    {/* Link back to the current subdomain's root */}
                    <Link
                        href="/"
                        className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        Go back home
                    </Link>

                    <Link href="#" className="text-sm font-semibold text-gray-900">
                        Contact support <span aria-hidden="true">&rarr;</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
