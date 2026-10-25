import React from "react";

/** A pulsing grey block: stands where content will appear, so the page keeps its shape while data loads. */
export function Skeleton({ className = "" }: { className?: string }) {
    return <div aria-hidden className={`animate-pulse rounded-[12px] bg-surface-container-high motion-reduce:animate-none ${className}`} />;
}

/** A row of stat tiles. */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-4">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="mt-3 h-7 w-2/3" />
                </div>
            ))}
        </div>
    );
}

/** A card with a title and a few list rows. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div role="status" aria-label="Loading" className="rounded-[24px] border border-outline-variant bg-surface-container-lowest p-4">
            <Skeleton className="h-4 w-1/3" />
            <div className="mt-4 space-y-3">
                {Array.from({ length: rows }, (_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** A card holding a chart. */
export function ChartSkeleton({ className = "h-56" }: { className?: string }) {
    return (
        <div role="status" aria-label="Loading" className="rounded-[24px] border border-outline-variant bg-surface-container-lowest p-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className={`mt-4 w-full ${className}`} />
        </div>
    );
}

/** Whole-dashboard outline: tiles, a chart and two lists. */
export function DashboardSkeleton() {
    return (
        <div className="space-y-4">
            <StatTilesSkeleton />
            <div className="grid gap-4 lg:grid-cols-2">
                <ChartSkeleton />
                <ListSkeleton />
            </div>
            <ListSkeleton rows={3} />
        </div>
    );
}
