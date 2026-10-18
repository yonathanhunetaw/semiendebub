/** What Admin\SystemStatusController sends (built by App\Services\Admin\SystemStatus). */

export type EventLevel = "info" | "warn" | "error";
export type NodeStatus = "online" | "stale" | "offline" | "off";

export interface SystemLease {
    node: string;
    /** Seconds since the holder last refreshed it. */
    age: number;
    /** Seconds it stays valid. */
    ttl: number;
    /** A deliberate takeover (the on-demand Mac): the others follow it. */
    pinned: boolean;
    fresh: boolean;
}

export interface SystemNode {
    name: string;
    role: string;
    on_demand: boolean;
    commit: string;
    in_sync: boolean;
    db_up: boolean;
    /** Its Cloudflare tunnel connector (docker/tunnel-guard.sh); "" = the guard does not run there. */
    tunnel: "on" | "off" | "";
    app_up: boolean;
    /** A deploy is running there (deploy/deploy.sh marks it); the other servers will not take over. */
    deploying: boolean;
    /** Seconds since that deploy started, null when none. */
    deploying_age: number | null;
    last_seen_age: number;
    status: NodeStatus;
    is_live: boolean;
    /** Seconds this node has been behind the newest backup; null = not behind or an old heartbeat. */
    behind_for: number | null;
    last_restore_age: number | null;
    /** Failed restores in a row. */
    restore_failures: number;
    last_backup_age: number | null;
    /** Age of the dump or restore the node last started from: writes after it are in no backup yet. */
    dump_age: number | null;
    /** Tables written since then; null = the node could not ask its database. */
    tables_changed: { count: number; names: string[] } | null;
}

export interface SystemEvent {
    time: string;
    ts: number;
    age: number;
    node: string;
    role: string;
    type: string;
    level: EventLevel;
    message: string;
    data: Record<string, unknown>;
}

export interface SystemAlert {
    level: EventLevel;
    message: string;
}

export interface DataReplacedData {
    from?: string;
    file?: string;
    safety_dump?: string;
    verdict?: "identical_rowcounts" | "rows_missing" | "rows_added_only";
    rows_missing?: number;
    rows_added?: number;
    /** table => [rows before, rows after] */
    changed?: Record<string, [number, number]>;
}

export interface SystemStatusSnapshot {
    now: number;
    empty: boolean;
    this_node: { name: string; role: string };
    lease: SystemLease | null;
    live_node: string | null;
    latest_backup: { file: string; node: string; time: string; bytes: number; age: number | null } | null;
    deployed: { commit: string; node: string; time: string } | null;
    nodes: SystemNode[];
    alerts: SystemAlert[];
    data_events: SystemEvent[];
    events: SystemEvent[];
    resources: NodeResources[];
}

/** One 5-minute cell of a node's day (App\\Services\\Admin\\UptimeHistory). */
export type CellState = "up" | "degraded" | "down" | "deploying" | "off" | "pending" | "unknown";

export interface UptimeOutage {
    from: number;
    minutes: number;
    ongoing: boolean;
}

export interface UptimeNode {
    name: string;
    role: string;
    on_demand: boolean;
    cells: CellState[];
    /** Share of recorded cells that were up; null = nothing recorded or an on-demand node. */
    uptime_pct: number | null;
    outages: UptimeOutage[];
    commits: { ts: number; from: string; to: string }[];
    samples: number;
}

export interface UptimeHistoryData {
    generated_at: number;
    /** Epoch of the first cell. */
    from: number;
    /** Seconds per cell. */
    step: number;
    /** Per cell: the node whose tunnel was up, "multiple" when two were, null when none reported one. */
    live: (string | null)[];
    nodes: UptimeNode[];
}

export interface RelatedLink {
    label: string;
    url: string;
}

/** One container on one node (App\\Services\\Admin\\NodeStats, from deploy/node-stats.sh). */
export interface ContainerInfo {
    name: string;
    image: string;
    state: string;
    status: string;
    health: "healthy" | "unhealthy" | "starting" | "";
    restarts: number;
    /** Seconds since it started; null when it is not running. */
    uptime: number | null;
    /** Percent of one core; null when no stats (stopped). */
    cpu: number | null;
    /** Bytes of memory in use; null when no stats. */
    mem: number | null;
}

export interface DiskInfo {
    mount: string;
    total: number;
    used: number;
    pct: number;
}

export interface HostInfo {
    cpus: number;
    /** 1, 5 and 15 minute load averages. */
    load: [number, number, number];
    /** 1-minute load as a percent of all cores. */
    load_pct: number;
    mem_total: number;
    mem_used: number;
    mem_pct: number | null;
    uptime: number;
    temp_c: number | null;
    disks: DiskInfo[];
}

export type NodeResources =
    | { name: string; reported: false }
    | { name: string; reported: true; age: number; stale: boolean; docker_ok: boolean; host: HostInfo; containers: ContainerInfo[] };
