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
    last_seen_age: number;
    status: NodeStatus;
    is_live: boolean;
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
}
