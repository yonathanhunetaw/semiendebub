export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <header>
                <nav>
                    <a className="nav-link" href="/">Home</a>
                    <a className="nav-link" href="/create">Create</a>
                </nav>
            </header>

            <main>
                {children}
            </main>
        </>
    )
}