import { href } from "@/Components/Shared/OpsHub";
import Scene from "@/Components/Visual/scenes";
import { Link } from "@inertiajs/react";
import React from "react";

export interface BannerFigureData {
    label: string;
    value: number;
    icon: string;
    /** Null shows the figure without a link (the screen behind it is not this admin's). */
    route: string | null;
    routeParams?: Record<string, string | number>;
    /** Lights the figure up when it is above zero: something waits for you. */
    alert?: boolean;
}

/** One figure in the banner: a number that opens the screen behind it. */
function BannerFigure({ figure }: { figure: BannerFigureData }): React.ReactElement {
    const target = href(figure.route, figure.routeParams);
    const lit = figure.alert && figure.value > 0;
    const className = `flex min-w-0 items-center gap-2.5 rounded-[12px] px-3 py-2.5 transition-colors ${
        lit ? "bg-warning-container text-on-warning-container" : "bg-on-primary/10 text-on-primary hover:bg-on-primary/20"
    }`;
    const body = (
        <>
            <span className="material-symbols-outlined text-[22px] opacity-90">{figure.icon}</span>
            <span className="min-w-0">
                <span className="block font-mono text-[18px] font-bold leading-tight">{figure.value.toLocaleString()}</span>
                <span className="block truncate text-[11px] font-medium opacity-80">{figure.label}</span>
            </span>
        </>
    );

    return target ? <Link href={target} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

/**
 * The banner at the top of the Store page: one store's, or every store's on
 * "All stores", so both scopes read the same.
 */
export default function StoreBanner({
    eyebrow,
    title,
    subtitle,
    figures,
}: {
    eyebrow: string;
    title: string;
    subtitle: string;
    figures: BannerFigureData[];
}): React.ReactElement {
    return (
        <section className="mb-3 overflow-hidden rounded-[16px] bg-gradient-to-br from-primary to-primary/80 p-4 text-on-primary shadow-sm sm:p-5">
            <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-surface-container-lowest shadow-sm sm:h-20 sm:w-20">
                    <Scene kind="store" size={56} title={title} />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">{eyebrow}</p>
                    <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
                    <p className="mt-0.5 truncate text-[12px] opacity-85">{subtitle}</p>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                {figures.map((figure) => (
                    <BannerFigure key={figure.label} figure={figure} />
                ))}
            </div>
        </section>
    );
}
