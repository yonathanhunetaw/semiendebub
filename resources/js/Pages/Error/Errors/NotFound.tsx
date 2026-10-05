import {Link} from '@inertiajs/react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
            <div className="text-center">
                {/* Visual element */}
                <h1 className="text-9xl font-bold text-primary">404</h1>

                <h2 className="mt-4 text-3xl font-bold text-on-surface tracking-tight sm:text-5xl">
                    Page not found
                </h2>

                <p className="mt-6 text-base leading-7 text-on-surface-variant">
                    Sorry, we couldn’t find the page you’re looking for.
                    It might have been moved or the subdomain is incorrect.
                </p>

                <div className="mt-10 flex items-center justify-center gap-x-6">
                    {/* Link back to the current subdomain's root */}
                    <Link
                        href="/"
                        className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        Go back home
                    </Link>

                    <Link href="#" className="text-sm font-semibold text-on-surface">
                        Contact support <span aria-hidden="true">&rarr;</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
