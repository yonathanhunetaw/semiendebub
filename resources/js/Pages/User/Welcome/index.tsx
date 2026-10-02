import { Head, Link } from "@inertiajs/react";
//@ts-ignore
import { PageProps } from "@/types";
import Globe from "@/Components/Globe";
import WelcomeNavbar from "@/Components/Navigation/Global/WelcomeNavbar";
import WelcomeFooter from "@/Components/WelcomeFooter";
import {
    Boxes,
    Warehouse,
    ShoppingCart,
    Truck,
    Wallet,
    Megaphone,
    UserCheck,
    Store,
    Globe2,
    ShieldCheck,
    ClipboardList,
    BarChart3,
    type LucideIcon,
} from "lucide-react";

interface Module {
    id: string;
    title: string;
    desc: string;
    Icon: LucideIcon;
    points: string[];
}

/**
 * The marketing view of the modules that actually ship in the app.
 * Each `id` doubles as the anchor target used by WelcomeNavbar's menus.
 */
const MODULES: Module[] = [
    {
        id: "inventory",
        title: "Items & Stock",
        desc: "A single catalogue of items, variants and warehouses, with quantities that stay honest across every location.",
        Icon: Boxes,
        points: ["Items, variants & categories", "Live stock levels per store", "Low-stock alerts & replenishment"],
    },
    {
        id: "warehouses",
        title: "Warehouses & Transfers",
        desc: "Move goods between warehouses and branches with a paper trail on both ends of every transfer.",
        Icon: Warehouse,
        points: ["Warehouse & bin structure", "Internal transfers", "Receive, count & reconcile"],
    },
    {
        id: "sales",
        title: "Sales & Customers",
        desc: "Take orders at the counter or from the field, then fulfil them against real stock and real customer accounts.",
        Icon: ShoppingCart,
        points: ["Carts, orders & invoices", "Customer accounts & history", "Order fulfilment pipeline"],
    },
    {
        id: "procurement",
        title: "Procurement",
        desc: "Raise purchase orders, keep vendor catalogues current and know what is on order before you reorder it.",
        Icon: ClipboardList,
        points: ["Purchase orders & approvals", "Vendor portal & catalogues", "Incoming goods tracking"],
    },
    {
        id: "delivery",
        title: "Delivery & Freight",
        desc: "Dispatch shipments, assign drivers and follow a consignment from the warehouse door to the customer's hand.",
        Icon: Truck,
        points: ["Shipment creation & dispatch", "Driver assignment", "Freight & delivery status"],
    },
    {
        id: "finance",
        title: "Finance",
        desc: "Purchases, sales and balances roll up on their own, so the numbers you report are the numbers the floor recorded.",
        Icon: Wallet,
        points: ["Balances & cash position", "Purchase & sales ledgers", "Department-level reporting"],
    },
    {
        id: "marketing",
        title: "Marketing & PR",
        desc: "Plan campaigns, publish announcements and keep public-facing work beside the operation it is selling.",
        Icon: Megaphone,
        points: ["Campaign planning", "PR & announcements", "Promotions tied to catalogue"],
    },
    {
        id: "workforce",
        title: "Attendance & Activity",
        desc: "Attendance, shifts and an activity log across modules — who worked, who shipped and what changed.",
        Icon: UserCheck,
        points: ["Attendance & shift records", "Per-user activity log", "Session & access history"],
    },
    {
        id: "stores",
        title: "Multi-Store",
        desc: "One registry, many branches. Each store keeps its own stock, staff and sales while head office sees all of it.",
        Icon: Store,
        points: ["Unlimited stores & branches", "Per-store stock and staff", "Consolidated head-office view"],
    },
    {
        id: "storefront",
        title: "Online Store",
        desc: "A public storefront that sells from the same stock the branches do — no second catalogue to maintain.",
        Icon: Globe2,
        points: ["Public product catalogue", "Online cart & checkout", "Orders land in the same queue"],
    },
    {
        id: "roles",
        title: "Roles & Access",
        desc: "Every department gets its own workspace and its own permissions, so staff see their work and nothing else.",
        Icon: ShieldCheck,
        points: ["Role-based workspaces", "Per-department access rules", "Admin, Finance, Stock, Delivery & more"],
    },
    {
        id: "insight",
        title: "Dashboards",
        desc: "Each role lands on a dashboard built for the decisions that role actually makes during the day.",
        Icon: BarChart3,
        points: ["Role-specific dashboards", "Operational KPIs", "Drill down to the record"],
    },
];

const ROLE_WORKSPACES = [
    "Admin",
    "Finance",
    "Procurement",
    "Stock Keeper",
    "Seller",
    "Delivery",
    "Marketing",
    "Vendor",
];

export default function Welcome({ auth }: PageProps) {
    const isAuthenticated = Boolean(auth?.user);

    return (
        <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-zinc-950 pt-[72px]">
            <Head>
                <title>Mezgebe Dirijit — Business Registry ERP</title>
                <meta
                    name="description"
                    content="Mezgebe Dirijit is an ERP for running a whole company: items and stock, sales, procurement, delivery, finance, marketing, attendance, multiple stores and an online storefront."
                />
                <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23c05800%22><path d=%22M4 10h3v7H4zm6.5 0h3v7h-3zM2 19h20v3H2zm15-9h3v7h-3zm-5-9L2 6v2h20V6z%22/></svg>" />
            </Head>

            <WelcomeNavbar />

            {/* --- HERO --- */}
            <section className="relative flex items-center justify-center overflow-hidden min-h-[88vh]">
                <div className="absolute inset-0 z-0">
                    <Globe />
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/85 via-zinc-950/40 to-zinc-950" />
                </div>

                <div className="z-10 w-full max-w-5xl px-6 py-20 text-center">
                    <p className="mb-5 font-mono text-xs tracking-[0.35em] uppercase text-orange-400/90">
                        መዝገበ ድርጅት · Business Registry
                    </p>
                    <h1 className="mb-6 text-5xl font-extrabold tracking-tighter text-white sm:text-6xl md:text-7xl drop-shadow-2xl">
                        MEZGEBE <span className="text-orange-500">DIRIJIT</span>
                    </h1>
                    <p className="max-w-2xl mx-auto mb-10 text-lg leading-relaxed rounded-xl text-zinc-300 md:text-xl backdrop-blur-sm bg-black/25 p-4">
                        One registry for the whole company — items and stock, sales,
                        procurement, delivery, finance, marketing, attendance, every
                        branch and your online store.
                    </p>

                    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                        {isAuthenticated ? (
                            <CtaPrimary href="/dashboard">Go to dashboard</CtaPrimary>
                        ) : (
                            <>
                                <CtaPrimary href={route("register")}>Create an account</CtaPrimary>
                                <CtaSecondary href={route("login")}>Log in</CtaSecondary>
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center mt-12 font-mono text-[11px] tracking-widest uppercase gap-x-6 gap-y-2 text-zinc-500">
                        <span>Multi-store</span>
                        <span className="text-orange-500/50">◆</span>
                        <span>Role-based access</span>
                        <span className="text-orange-500/50">◆</span>
                        <span>Online storefront</span>
                        <span className="text-orange-500/50">◆</span>
                        <span>Built for Ethiopian business</span>
                    </div>
                </div>
            </section>

            <main className="relative z-20">
                {/* --- ABOUT --- */}
                <section id="about" className="px-6 py-24 mx-auto max-w-7xl scroll-mt-24">
                    <div className="max-w-3xl">
                        <SectionLabel>What it is</SectionLabel>
                        <h2 className="mb-6 text-3xl font-bold leading-tight text-white md:text-5xl">
                            A business registry, not a pile of spreadsheets.
                        </h2>
                        <p className="mb-5 text-lg leading-relaxed text-zinc-400">
                            <span className="text-zinc-200">Mezgebe Dirijit</span> — Amharic for
                            <em> business registry</em> — is an ERP that keeps one record of
                            everything a company owns, buys, sells, ships and owes. Stock
                            counted in a branch, a purchase order raised by procurement and a
                            delivery marked complete by a driver all land in the same place.
                        </p>
                        <p className="text-lg leading-relaxed text-zinc-400">
                            Departments get their own workspaces and permissions, so the
                            stock keeper sees shelves, finance sees balances, and the owner
                            sees all of it without asking anyone to export a file.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mt-16 lg:grid-cols-4">
                        <StatTile value="12" label="Modules" />
                        <StatTile value="8" label="Role workspaces" />
                        <StatTile value="∞" label="Stores & warehouses" />
                        <StatTile value="1" label="Source of truth" />
                    </div>
                </section>

                {/* --- MODULES --- */}
                <section className="px-6 py-24 border-t border-zinc-900 bg-zinc-950">
                    <div className="mx-auto max-w-7xl">
                        <div className="max-w-3xl mb-16">
                            <SectionLabel>Modules</SectionLabel>
                            <h2 className="mb-5 text-3xl font-bold text-white md:text-5xl">
                                Everything the company runs on
                            </h2>
                            <p className="text-lg text-zinc-400">
                                Turn on what you need. Each module writes to the same registry,
                                so nothing has to be entered twice.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {MODULES.map((module) => (
                                <ModuleCard key={module.id} {...module} />
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- MULTI-STORE + STOREFRONT SPOTLIGHT --- */}
                <section className="px-6 py-24 border-t border-zinc-900">
                    <div className="grid items-center grid-cols-1 gap-16 mx-auto max-w-7xl lg:grid-cols-2">
                        <div>
                            <SectionLabel>Many branches, one registry</SectionLabel>
                            <h2 className="mb-6 text-3xl font-bold text-white md:text-4xl">
                                Open a second store without starting a second system
                            </h2>
                            <p className="mb-8 leading-relaxed text-zinc-400">
                                Each store keeps its own stock, staff and sales. Head office
                                sees the consolidated picture, transfers goods between
                                branches and compares them side by side — all from the same
                                account.
                            </p>
                            <ul className="space-y-3">
                                {[
                                    "Per-store stock, pricing and staff",
                                    "Branch-to-branch transfers with a paper trail",
                                    "Consolidated reporting across every location",
                                    "An online storefront selling from the same shelves",
                                ].map((line) => (
                                    <li key={line} className="flex gap-3 text-zinc-300">
                                        <span className="mt-1 text-orange-500">▹</span>
                                        <span>{line}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Schematic: head office over branches + online store */}
                        <div className="p-8 border bg-zinc-900/50 border-zinc-800 rounded-3xl">
                            <div className="p-4 mb-6 text-center border rounded-xl border-orange-500/40 bg-orange-500/10">
                                <p className="font-mono text-[10px] tracking-widest uppercase text-orange-400">
                                    Head office
                                </p>
                                <p className="font-bold text-white">Mezgebe Dirijit</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { name: "Store · Bole", meta: "1,284 SKUs" },
                                    { name: "Store · Piassa", meta: "947 SKUs" },
                                    { name: "Warehouse · Kality", meta: "12,650 units" },
                                    { name: "Online store", meta: "Public storefront" },
                                ].map((node) => (
                                    <div
                                        key={node.name}
                                        className="p-4 border rounded-xl border-zinc-800 bg-zinc-950/60"
                                    >
                                        <p className="text-sm font-semibold text-zinc-200">{node.name}</p>
                                        <p className="font-mono text-[10px] text-zinc-500">{node.meta}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- ROLE WORKSPACES --- */}
                <section className="px-6 py-24 border-t border-zinc-900 bg-zinc-900/30">
                    <div className="mx-auto text-center max-w-7xl">
                        <SectionLabel center>Workspaces</SectionLabel>
                        <h2 className="mb-5 text-3xl font-bold text-white md:text-4xl">
                            Each department gets its own desk
                        </h2>
                        <p className="max-w-2xl mx-auto mb-12 text-zinc-400">
                            Staff sign in and land on the workspace for their role — with the
                            records, actions and dashboard that role needs, and nothing it
                            doesn't.
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                            {ROLE_WORKSPACES.map((role) => (
                                <span
                                    key={role}
                                    className="px-5 py-2.5 text-sm font-semibold transition-colors border rounded-full border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-orange-500/50 hover:text-orange-300"
                                >
                                    {role}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- FINAL CTA --- */}
                <section className="px-6 py-28 border-t border-zinc-900">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="mb-5 text-3xl font-bold text-white md:text-5xl">
                            Put the whole company in one registry
                        </h2>
                        <p className="mb-10 text-lg text-zinc-400">
                            Create an account to set up your company, add your stores and
                            invite your team. Already set up? Sign in and pick up where you
                            left off.
                        </p>
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            {isAuthenticated ? (
                                <CtaPrimary href="/dashboard">Go to dashboard</CtaPrimary>
                            ) : (
                                <>
                                    <CtaPrimary href={route("register")}>Sign up</CtaPrimary>
                                    <CtaSecondary href={route("login")}>Log in</CtaSecondary>
                                </>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            <WelcomeFooter />
        </div>
    );
}

/* --- HELPER COMPONENTS --- */

function CtaPrimary({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="w-full px-8 py-4 text-base font-bold text-white transition-colors bg-orange-600 rounded-full sm:w-auto hover:bg-orange-500"
        >
            {children}
        </Link>
    );
}

function CtaSecondary({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="w-full px-8 py-4 text-base font-bold transition-colors border rounded-full sm:w-auto border-zinc-700 text-zinc-200 hover:border-orange-500 hover:text-orange-300"
        >
            {children}
        </Link>
    );
}

function SectionLabel({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
    return (
        <p
            className={`mb-4 font-mono text-[11px] tracking-[0.25em] uppercase text-orange-400 ${
                center ? "text-center" : ""
            }`}
        >
            {children}
        </p>
    );
}

function StatTile({ value, label }: { value: string; label: string }) {
    return (
        <div className="p-6 border bg-zinc-900/40 border-zinc-800 rounded-2xl">
            <p className="text-3xl font-extrabold text-orange-400 md:text-4xl">{value}</p>
            <p className="mt-1 font-mono text-[11px] tracking-widest uppercase text-zinc-500">
                {label}
            </p>
        </div>
    );
}

function ModuleCard({ id, title, desc, points, Icon }: Module) {
    return (
        <div
            id={id}
            className="p-7 transition-all duration-300 border group bg-zinc-900/50 border-zinc-800 rounded-2xl hover:border-orange-500/50 hover:bg-zinc-900 scroll-mt-24"
        >
            <div className="flex items-center justify-center mb-5 transition-colors border rounded-xl w-11 h-11 border-orange-500/30 bg-orange-500/10 group-hover:bg-orange-500/20">
                <Icon size={20} className="text-orange-400" strokeWidth={2} />
            </div>
            <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
            <p className="mb-5 text-sm leading-relaxed text-zinc-400">{desc}</p>
            <ul className="pt-4 space-y-2 border-t border-zinc-800">
                {points.map((point) => (
                    <li key={point} className="font-mono text-[11px] text-zinc-500">
                        ▷ {point}
                    </li>
                ))}
            </ul>
        </div>
    );
}
