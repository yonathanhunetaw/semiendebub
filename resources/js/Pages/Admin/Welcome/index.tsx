import Layout from '@/Layouts/Layout'
import {Head, Link} from '@inertiajs/react'

export default function Index({auth}) {
    return (
        <Layout>
            <Head title="Welcome to Duka"/>

            <div className="relative isolate px-6 pt-14 lg:px-8">
                <div className="mx-auto max-auto py-32 sm:py-48 lg:py-56 text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                        Duka <span className="text-indigo-600">Portal</span>
                    </h1>

                    <p className="mt-6 text-lg leading-8 text-gray-600">
                        Select an option below to manage your department's operations.
                        Please ensure you are on the correct subdomain for your role.
                    </p>

                    <div className="mt-10 flex items-center justify-center gap-x-6">
                        {/* If we are on admin.duka.local, this "/" points to the root.
                           We use Link for SPA navigation so the page doesn't reload.
                        */}
                        <Link
                            href={route('login')}
                            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                            Log in to Dashboard
                        </Link>

                        <a href="#" className="text-sm font-semibold leading-6 text-gray-900">
                            Learn more <span aria-hidden="true">→</span>
                        </a>
                    </div>
                </div>
            </div>
        </Layout>
    )
}
