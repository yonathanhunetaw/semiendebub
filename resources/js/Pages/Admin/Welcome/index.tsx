import Layout from '@/Layouts/Layout'
import {Head, Link} from '@inertiajs/react'

type Props = {
    auth?: {
        user?: {
            id: number
            name: string
            email: string
        }
    }
}
export default function Index({auth}: Props) {
    return (
        <Layout>
            <Head title="Welcome to Duka"/>

            <div className="relative isolate px-6 pt-14 lg:px-8">
                <div className="mx-auto max-auto py-32 sm:py-48 lg:py-56 text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-on-surface sm:text-6xl">
                        Duka <span className="text-primary">Portal</span>
                    </h1>

                    <p className="mt-6 text-lg leading-8 text-on-surface-variant">
                        Select an option below to manage your department's operations.
                        Please ensure you are on the correct subdomain for your role.
                    </p>

                    <div className="mt-10 flex items-center justify-center gap-x-6">
                        {/* If we are on the admin subdomain, this "/" points to the root.
                           We use Link for SPA navigation so the page doesn't reload.
                        */}
                        <Link
                            href={route('login')}
                            className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                            Log in to Dashboard
                        </Link>

                        <a href="#" className="text-sm font-semibold leading-6 text-on-surface">
                            Learn more <span aria-hidden="true">→</span>
                        </a>
                    </div>
                </div>
            </div>
        </Layout>
    )
}
