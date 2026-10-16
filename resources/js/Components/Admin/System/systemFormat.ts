/** Small formatting helpers for the System status page. */

import type { SystemNode, SystemStatusSnapshot } from "@/types/systemStatus";

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
    tunnel_on: "Tunnel connector on",
    tunnel_off: "Tunnel connector off",
    tunnel_handback: "Handed visitors back",
    failover: "Took over visitors (failover)",
    failover_refused: "Could not take over",
};

/** The numbers the scripts use (docker/tunnel-guard.sh, docker/backup-db.sh, deploy/db-lib.sh). */
export const TIMINGS = {
    failoverMin: 3, // TUNNEL_FAILOVER_SEC 180
    backupEveryMin: 5,
    leaseMin: 15, // BACKUP_LEASE_MIN
    deployGraceMin: 20, // DEPLOY_GRACE_SEC 1200
    handbackMaxMin: 15, // TUNNEL_HANDBACK_MAX 900
};

export interface NodeExplanation {
    level: "ok" | "info" | "warn" | "error";
    text: string;
}

/** What this server is doing right now and why, in one or two plain sentences. */
export function explainNode(n: SystemNode, status: SystemStatusSnapshot): NodeExplanation[] {
    const out: NodeExplanation[] = [];
    const live = status.live_node;
    const deployed = status.deployed?.commit ?? "";

    if (n.status === "off") {
        return [{ level: "info", text: "Switched off (on demand). It only serves when you run make prod on it, and hands back with make prod-stop." }];
    }
    if (n.status === "offline" || n.status === "stale") {
        out.push({
            level: n.is_live ? "error" : "warn",
            text: `Has not reported for ${ago(n.last_seen_age).replace(" ago", "")}. ${n.is_live ? `If it stays silent, a standby takes over after ${TIMINGS.failoverMin} min.` : "It cannot take over while it is silent."}`,
        });
    }

    if (n.deploying) {
        out.push({
            level: "info",
            text: `Deploying (started ${ago(n.deploying_age)}). Its app restarts for a minute or two; the other servers know and will not take over.`,
        });
    }

    if (n.is_live) {
        out.push({
            level: "ok",
            text: `Takes the visitors. Uploads a backup every ${TIMINGS.backupEveryMin} min, which also keeps its lease (the "I am live" note in R2).`,
        });
    } else if (n.role === "standby") {
        out.push({
            level: "ok",
            text: `Waiting as the backup server. Loads each new backup within a minute${n.on_demand ? "" : " and deploys every commit the live server deploys"}. ${
                n.on_demand ? "It never takes over by itself." : `Takes over if ${live ?? "the live server"} stops reporting for ${TIMINGS.failoverMin} min or its app stops answering (not during a deploy).`
            }`,
        });
    } else if (n.role === "primary") {
        out.push({ level: "warn", text: `The main server, but not live right now: ${live ? `${live} holds the lease. ${live} hands back by itself once this server is healthy, then this one loads its last backup and goes live.` : "nobody holds the lease. This server takes it once its data is the newest."}` });
    }

    if (n.tunnel === "") {
        out.push({ level: "error", text: "The tunnel guard does not run here, so its Cloudflare connector is not controlled: Cloudflare may send visitors to it. Add the tunnel-guard cron line." });
    } else if (n.tunnel === "on" && !n.is_live) {
        out.push({ level: "error", text: "Its tunnel is on although it is not live: visitors may land here. The guard should turn it off within a minute." });
    } else if (n.tunnel === "off" && n.is_live && n.status === "online") {
        out.push({ level: "warn", text: "It holds the lease but its tunnel is off: nobody takes visitors. The guard should turn it on within a minute (a hand-back can take 1 to 2 min)." });
    }

    if (deployed && n.commit && !deployed.startsWith(n.commit) && !n.deploying && !n.on_demand) {
        out.push({ level: "warn", text: `Still on ${n.commit}, the live code is ${deployed.slice(0, 7)}. Auto-deploy has not followed yet: check deploy/logs/auto-deploy.log on it.` });
    }
    if (!n.app_up && !n.deploying && n.status === "online") {
        out.push({ level: "error", text: "Its app does not answer on its port, so it cannot take visitors or take over." });
    }

    return out;
}
