/** Small formatting helpers for the System status page. */

/** 40 -> "40s ago", 200 -> "3m ago", 7300 -> "2h ago". */
export function ago(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return "unknown";
    if (seconds < 5) return "just now";
    if (seconds < 90) return `${Math.round(seconds)}s ago`;
    if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`;

    return `${Math.round(seconds / 86400)}d ago`;
}

export function bytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;

    return `${(n / 1048576).toFixed(1)} MB`;
}

/** "14 Oct, 06:13" in the viewer's time zone, from an ISO string. */
export function localTime(iso: string): string {
    const d = new Date(iso);

    return Number.isNaN(d.getTime())
        ? iso
        : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** The event types the scripts write, in plain words. */
export const EVENT_LABELS: Record<string, string> = {
    backup_pushed: "Backup uploaded",
    backup_failed: "Backup problem",
    lease_takeover: "Took over as primary",
    lease_released: "Handed the lease back",
    synced: "Followed a backup",
    data_replaced: "Data replaced by a backup",
    behind: "Behind the newest backup",
    deploy_started: "Deploy started",
    deploy_done: "Deploy finished",
    deploy_failed: "Deploy failed",
    auto_deploy_started: "Auto-deploy started",
    auto_deploy_done: "Auto-deploy finished",
    auto_deploy_failed: "Auto-deploy failed",
};
