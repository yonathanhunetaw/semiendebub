import AdminLayout from "@/Layouts/AdminLayout";
import { Head, router, usePage } from "@inertiajs/react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material";

/**
 * Turns a raw user-agent string into a short "Browser on OS" label
 * instead of chopping the string mid-word.
 */
function describeDevice(userAgent) {
    if (!userAgent) return "Unknown device";

    const browser = userAgent.match(/(Chrome|Firefox|Safari|Edg|OPR)\/[\d.]+/)?.[1]
        ?.replace("Edg", "Edge")
        ?.replace("OPR", "Opera") ?? "Unknown browser";

    const os =
        userAgent.match(/Windows|Mac OS X|Linux|Android|iPhone|iPad/)?.[0] ??
        "Unknown OS";

    return `${browser} on ${os}`;
}

function formatTimeLeft(expiresAtStr, now, rememberMe) {
    const diffMs = new Date(expiresAtStr) - now;
    if (diffMs <= 0) return { label: "Expired", expired: true };

    const totalMinutes = Math.floor(diffMs / 60000);
    
    // If it's a "remember me" session lasting over a day, show days/months instead of raw hours
    if (rememberMe && totalMinutes > 1440) {
        const days = Math.floor(totalMinutes / 1440);
        return {
            label: `${days}d+`,
            expired: false,
        };
    }

    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    return {
        label: `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
        expired: false,
    };
}

export default function Index({ sessions = [] }) {
    const { flash = {} } = usePage().props;
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [query, setQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [selectedIds, setSelectedIds] = useState([]);
    const [now, setNow] = useState(() => new Date());
    const [pendingIds, setPendingIds] = useState([]);
    const [bulkPending, setBulkPending] = useState(false);
    const [extendDuration, setExtendDuration] = useState(120);

    // Derive unique roles from the session list for filter pills
    const uniqueRoles = useMemo(() => {
        const roles = new Set();
        sessions.forEach((s) => {
            const role = s.user?.role || "guest";
            roles.add(role);
        });
        return Array.from(roles).sort();
    }, [sessions]);

    // Keep the countdown column live without a full page refresh.
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, []);

    const filteredSessions = useMemo(() => {
        const q = query.trim().toLowerCase();

        return sessions.filter((s) => {
            // Role filter
            if (roleFilter !== "all") {
                const sessionRole = s.user?.role || "guest";
                if (sessionRole !== roleFilter) return false;
            }

            // Text search
            if (!q) return true;
            const haystack = [
                s.user?.first_name,
                s.user?.last_name,
                s.user?.email,
                s.ip_address,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [sessions, query, roleFilter]);

    const selectableIds = useMemo(
        () => filteredSessions.filter((s) => !s.is_current).map((s) => s.id),
        [filteredSessions]
    );

    const allSelected =
        selectableIds.length > 0 &&
        selectableIds.every((id) => selectedIds.includes(id));

    const toggleAll = () => {
        setSelectedIds(allSelected ? [] : selectableIds);
    };

    const toggleOne = (id) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const withPending = (id, fn) => {
        setPendingIds((p) => [...p, id]);
        fn(() => setPendingIds((p) => p.filter((x) => x !== id)));
    };

    const handleDelete = (id, isCurrent) => {
        const message = isCurrent
            ? "This is your current session. You will be logged out. Continue?"
            : "Force logout this user?";

        if (!confirm(message)) return;

        withPending(id, (done) =>
            router.delete(route("admin.sessions.destroy", id), {
                preserveScroll: true,
                onFinish: done,
            })
        );
    };

    const handleExtend = (id) => {
        withPending(id, (done) =>
            router.post(route("admin.sessions.extend", id), {
                minutes: extendDuration,
            }, {
                preserveScroll: true,
                onFinish: done,
            })
        );
    };

    const handleExtendAll = () => {
        setBulkPending(true);
        router.post(route("admin.sessions.extendAll"), {
            minutes: extendDuration,
        }, {
            preserveScroll: true,
            onFinish: () => setBulkPending(false),
        });
    };

    const handleTerminateAll = () => {
        if (!confirm("Terminate every session except your own?")) return;

        setBulkPending(true);
        router.delete(route("admin.sessions.destroyAll"), {
            preserveScroll: true,
            onFinish: () => setBulkPending(false),
        });
    };

    const handleExtendSelected = () => {
        setBulkPending(true);
        router.post(
            route("admin.sessions.extendSelected"),
            { ids: selectedIds, minutes: extendDuration },
            {
                preserveScroll: true,
                onFinish: () => setBulkPending(false),
                onSuccess: () => setSelectedIds([]),
            }
        );
    };

    const handleDestroySelected = () => {
        if (!confirm(`Terminate ${selectedIds.length} selected session(s)?`)) return;

        setBulkPending(true);
        router.delete(route("admin.sessions.destroySelected"), {
            data: { ids: selectedIds },
            preserveScroll: true,
            onFinish: () => setBulkPending(false),
            onSuccess: () => setSelectedIds([]),
        });
    };

    return (
        <div className="w-full text-on-background font-body-md pb-24 md:pb-0 relative min-h-screen">
            <style dangerouslySetInnerHTML={{
                __html: `
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .animate-pulse-fast {
            animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .glass-panel {
            background: ${isDark ? 'rgba(31, 42, 54, 0.4)' : 'rgba(255, 255, 255, 0.6)'};
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid ${isDark ? 'rgba(126, 139, 154, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
            box-shadow: ${isDark ? '0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05)' : '0px 2px 1px -1px rgba(0,0,0,0.1), 0px 1px 1px 0px rgba(0,0,0,0.05), 0px 1px 3px 0px rgba(0,0,0,0.05)'};
        }
        .glass-appbar {
            background: ${isDark ? 'rgba(11, 17, 24, 0.8)' : 'rgba(255, 255, 255, 0.8)'};
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid ${isDark ? 'rgba(126, 139, 154, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
            box-shadow: ${isDark ? '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)' : '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.05), 0px 1px 10px 0px rgba(0,0,0,0.05)'};
        }
        ${!isDark ? `
            /* Light mode overrides for hardcoded Tailwind dark colors */
            .text-on-surface { color: rgba(0,0,0,0.87) !important; }
            .text-on-surface-variant { color: rgba(0,0,0,0.6) !important; }
            .text-on-background { color: rgba(0,0,0,0.87) !important; }
            .text-primary { color: #1976d2 !important; }
            .text-error { color: #d32f2f !important; }
            
            .bg-surface-container-high { background-color: #f3f4f6 !important; }
            .bg-surface-container-highest { background-color: #e5e7eb !important; }
            .bg-surface-container-low { background-color: #ffffff !important; }
            
            .bg-primary\\/5 { background-color: rgba(25, 118, 210, 0.05) !important; }
            .bg-primary\\/10 { background-color: rgba(25, 118, 210, 0.1) !important; }
            .bg-primary\\/20 { background-color: rgba(25, 118, 210, 0.2) !important; }
            
            .bg-error\\/20 { background-color: rgba(211, 47, 47, 0.1) !important; }
            
            .border-outline-variant\\/30 { border-color: rgba(0,0,0,0.12) !important; }
            .border-outline-variant\\/50 { border-color: rgba(0,0,0,0.2) !important; }
            .border-primary\\/30 { border-color: rgba(25, 118, 210, 0.3) !important; }
            .border-primary\\/50 { border-color: rgba(25, 118, 210, 0.5) !important; }
            .border-error\\/50 { border-color: rgba(211, 47, 47, 0.5) !important; }
            
            .hover\\:bg-surface-container-high:hover { background-color: #f3f4f6 !important; }
            .hover\\:bg-surface-container-highest:hover { background-color: #e5e7eb !important; }
            .hover\\:bg-surface-container-high\\/60:hover { background-color: rgba(243, 244, 246, 0.6) !important; }
            .hover\\:text-on-surface:hover { color: rgba(0,0,0,0.87) !important; }
            
            .hover\\:bg-error\\/30:hover { background-color: rgba(211, 47, 47, 0.15) !important; }
            .hover\\:border-primary\\/50:hover { border-color: rgba(25, 118, 210, 0.5) !important; }
            .focus\\:ring-primary\\/50:focus { --tw-ring-color: rgba(25, 118, 210, 0.5) !important; box-shadow: var(--tw-ring-inset) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color) !important; }
        ` : ''}
        `
            }} />

            {/* Background ambient glow */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none z-0"></div>
            <div className="fixed bottom-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] pointer-events-none z-0"></div>

            <div className="relative z-10 w-full max-w-[1600px] mx-auto p-margin-mobile md:p-margin-desktop">
                {flash?.message && (
                    <div className="p-4 mb-6 text-green-400 border rounded-lg glass-panel border-green-500/20">
                        {flash.message}
                    </div>
                )}

                {flash?.error && (
                    <div className="p-4 mb-6 text-red-400 border rounded-lg glass-panel border-red-500/20">
                        {flash.error}
                    </div>
                )}

                {/* Page Header */}
                <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-md">
                    <div>
                        <h1 className="font-display-lg text-display-lg text-on-surface drop-shadow-md">
                            Active Sessions
                        </h1>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs">
                            Managing {sessions.length} active connection{sessions.length === 1 ? "" : "s"}.
                        </p>
                    </div>
                    <div className="flex gap-sm">
                        <select
                            value={extendDuration}
                            onChange={(e) => setExtendDuration(Number(e.target.value))}
                            className="glass-panel text-on-surface px-3 py-[6px] rounded font-medium text-[13px] tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/50"
                        >
                            <option value={120}>2 hours</option>
                            <option value={1440}>24 hours</option>
                            <option value={8640}>6 days</option>
                            <option value={43200}>30 days</option>
                        </select>
                        <button
                            onClick={handleExtendAll}
                            disabled={bulkPending}
                            className="glass-panel text-on-surface px-4 py-[6px] rounded font-medium text-[13px] uppercase tracking-wider flex items-center gap-xs hover:bg-surface-container-high hover:border-primary/50 transition-all shadow-sm disabled:opacity-50"
                        >
                            Extend All
                        </button>
                        <button
                            onClick={handleTerminateAll}
                            disabled={bulkPending}
                            className="bg-error/20 border border-error/50 text-error px-4 py-[6px] rounded font-medium text-[13px] uppercase tracking-wider flex items-center gap-xs hover:bg-error/30 transition-all shadow-sm disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                            Terminate All
                        </button>
                    </div>
                </div>

                {/* Search + Role Filters */}
                <div className="mb-md flex flex-col gap-sm">
                    <div className="relative max-w-sm">
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-[14px] top-1/2 -translate-y-1/2">
                            search
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name, email, or IP"
                            className="w-full pl-[42px] pr-sm py-2 glass-panel rounded-lg text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder-outline text-[14px]"
                        />
                    </div>

                    {/* Role filter pills */}
                    {uniqueRoles.length > 1 && (
                        <div className="flex flex-wrap gap-xs">
                            <button
                                onClick={() => setRoleFilter("all")}
                                className={`px-3 py-1 rounded-full text-[12px] font-medium uppercase tracking-wider transition-all border ${
                                    roleFilter === "all"
                                        ? "bg-primary/20 border-primary/50 text-primary"
                                        : "glass-panel border-outline-variant/40 text-on-surface-variant hover:border-primary/30 hover:text-on-surface"
                                }`}
                            >
                                All
                                <span className="ml-1 opacity-60 text-[10px]">({sessions.length})</span>
                            </button>
                            {uniqueRoles.map((role) => {
                                const count = sessions.filter(s => (s.user?.role || "guest") === role).length;
                                const isActive = roleFilter === role;
                                return (
                                    <button
                                        key={role}
                                        onClick={() => setRoleFilter(isActive ? "all" : role)}
                                        className={`px-3 py-1 rounded-full text-[12px] font-medium uppercase tracking-wider transition-all border ${
                                            isActive
                                                ? "bg-primary/20 border-primary/50 text-primary"
                                                : "glass-panel border-outline-variant/40 text-on-surface-variant hover:border-primary/30 hover:text-on-surface"
                                        }`}
                                    >
                                        {role}
                                        <span className="ml-1 opacity-60 text-[10px]">({count})</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Bulk action bar */}
                {selectedIds.length > 0 && (
                    <div className="mb-md flex flex-wrap items-center justify-between gap-sm p-sm rounded-xl glass-panel border-primary/30">
                        <span className="font-medium text-[12px] uppercase tracking-widest text-primary/80">
                            {selectedIds.length} selected
                        </span>
                        <div className="flex gap-sm">
                            <button
                                onClick={handleExtendSelected}
                                disabled={bulkPending}
                                className="px-3 py-1.5 border border-primary/50 bg-primary/10 text-primary rounded font-medium text-[12px] uppercase tracking-wider hover:bg-primary/20 transition-colors shadow-sm disabled:opacity-50"
                            >
                                Extend Selected
                            </button>
                            <button
                                onClick={handleDestroySelected}
                                disabled={bulkPending}
                                className="px-3 py-1.5 bg-error/20 border border-error/50 text-error rounded font-medium text-[12px] uppercase tracking-wider hover:bg-error/30 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-xs"
                            >
                                <span className="material-symbols-outlined text-[14px]">block</span> Terminate
                            </button>
                            <button
                                onClick={() => setSelectedIds([])}
                                className="px-3 py-1.5 text-on-surface-variant font-medium text-[12px] uppercase tracking-wider hover:text-on-surface transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {filteredSessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-xs py-2xl text-center glass-panel rounded-xl mt-4">
                        <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-2 opacity-50">
                            {sessions.length === 0 ? "wifi_off" : "search_off"}
                        </span>
                        <p className="font-body-md text-body-md text-on-surface">
                            {sessions.length === 0
                                ? "No active sessions right now."
                                : roleFilter !== "all"
                                ? `No ${roleFilter} sessions found.`
                                : "No sessions match your search."}
                        </p>
                        {roleFilter !== "all" && (
                            <button
                                onClick={() => setRoleFilter("all")}
                                className="mt-xs text-primary text-[12px] font-medium uppercase tracking-wider hover:underline"
                            >
                                Clear filter
                            </button>
                        )}
                    </div>
                )}

                {/* Session List */}
                <div className="flex flex-col gap-md">
                    {filteredSessions.map((s) => {
                        const { label: timeLeft, expired } = formatTimeLeft(s.expires_at, now, s.remember_me);
                        const isPending = pendingIds.includes(s.id);
                        
                        const isCurrent = s.is_current;
                        const isCritical = !expired && !s.remember_me && timeLeft.startsWith("00:");
                        const isIdle = !s.is_live;

                        return (
                            <div
                                key={s.id}
                                className={`glass-panel rounded-xl p-md flex flex-col md:grid md:grid-cols-12 md:gap-sm hover:bg-surface-container-high/60 transition-all group relative overflow-hidden ${isIdle ? 'opacity-80' : ''}`}
                            >
                                {isCurrent && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/80 shadow-[0_0_8px_rgba(125,211,252,0.8)]"></div>
                                )}
                                {isCritical && !isCurrent && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-error/80 shadow-[0_0_8px_rgba(255,180,171,0.8)] animate-pulse-fast"></div>
                                )}

                                <div className="hidden md:flex col-span-1 items-center justify-center">
                                    <input
                                        type="checkbox"
                                        aria-label={`Select session for ${s.user?.email ?? "guest"}`}
                                        checked={selectedIds.includes(s.id)}
                                        onChange={() => toggleOne(s.id)}
                                        disabled={isCurrent}
                                        className="rounded border-outline-variant text-primary focus:ring-primary w-4 h-4 bg-surface-container-low disabled:opacity-30"
                                    />
                                </div>

                                {/* User Info */}
                                <div className="md:col-span-3 flex items-start md:items-center gap-sm mb-md md:mb-0">
                                    <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-primary font-headline-sm text-headline-sm overflow-hidden shrink-0 shadow-sm uppercase">
                                        {s.user?.first_name ? (
                                            s.user.first_name[0]
                                        ) : (
                                            <span className="material-symbols-outlined text-primary/70">person</span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-xs flex-wrap">
                                            {s.user?.first_name
                                                ? `${s.user.first_name} ${s.user.last_name || ""}`
                                                : "Guest"}
                                            {isCurrent && (
                                                <span className="bg-primary/20 border border-primary/30 text-primary px-2 py-0.5 rounded-full font-medium text-[10px] tracking-wide uppercase shadow-[0_0_8px_rgba(125,211,252,0.2)]">
                                                    You
                                                </span>
                                            )}
                                            {!isCurrent && (
                                                <span className="bg-surface-container-highest border border-outline-variant/50 text-on-surface-variant px-2 py-0.5 rounded-full font-medium text-[10px] tracking-wide uppercase">
                                                    {s.user?.role || "Guest"}
                                                </span>
                                            )}
                                        </div>
                                        <div className="font-mono-data text-mono-data text-on-surface-variant mt-xs truncate max-w-[200px]">
                                            {s.user?.email || "N/A"}
                                        </div>
                                    </div>
                                </div>

                                {/* Status */}
                                <div className="md:col-span-2 flex items-center mb-sm md:mb-0">
                                    {s.is_live ? (
                                        <div className="flex items-center gap-xs bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-fast shadow-[0_0_6px_rgba(52,211,153,0.8)]"></div>
                                            <span className="font-medium text-[12px] tracking-wide text-emerald-300">Active Now</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-xs bg-surface-container-highest/50 border border-outline-variant/30 px-3 py-1 rounded-full">
                                            <div className="w-2 h-2 rounded-full bg-outline"></div>
                                            <span className="font-medium text-[12px] tracking-wide text-on-surface-variant">Idle {s.last_active_human}</span>
                                        </div>
                                    )}
                                </div>

                                {/* IP/Location */}
                                <div className="md:col-span-2 flex flex-col justify-center mb-sm md:mb-0">
                                    <div className="font-mono-data text-mono-data text-on-surface truncate">{s.ip_address || "Unknown"}</div>
                                    <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-xs mt-xs truncate max-w-[200px]" title={s.user_agent}>
                                        <span className="material-symbols-outlined text-[14px] text-primary/70">devices</span> 
                                        {describeDevice(s.user_agent)}
                                    </div>
                                </div>

                                {/* Expiry */}
                                <div className="md:col-span-2 flex md:justify-end items-center mb-md md:mb-0">
                                    <div className="text-right flex items-center md:items-end flex-row md:flex-col gap-sm md:gap-0">
                                        <div className={`font-mono-data text-mono-data font-bold flex items-center gap-xs ${expired ? "text-error" : (isCritical ? "text-error animate-pulse drop-shadow-[0_0_4px_rgba(255,180,171,0.5)]" : "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]")}`}>
                                            <span className="material-symbols-outlined text-[16px]">timer</span> {timeLeft}
                                        </div>
                                        <div className="font-medium text-[11px] tracking-wide uppercase text-on-surface-variant mt-xs">
                                            {s.remember_me ? "Remembered" : "Session"}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="md:col-span-2 flex justify-between md:justify-end items-center gap-sm mt-auto">
                                    <button 
                                        onClick={() => handleExtend(s.id)}
                                        disabled={isPending}
                                        className="flex-1 md:flex-none px-3 py-1.5 border border-outline-variant/50 bg-surface-container-high/50 text-on-surface rounded font-medium text-[12px] uppercase tracking-wider hover:bg-surface-container-highest transition-colors active:shadow-inner disabled:opacity-50"
                                    >
                                        Extend
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(s.id, s.is_current)}
                                        disabled={isPending}
                                        className="flex-1 md:flex-none px-3 py-1.5 bg-error/20 border border-error/50 text-error rounded font-medium text-[12px] uppercase tracking-wider hover:bg-error/30 transition-colors active:shadow-inner flex items-center justify-center gap-xs disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">block</span> Term
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination */}
                {sessions.length > 0 && (
                    <div className="mt-lg flex items-center justify-between border-t border-outline-variant/30 pt-md">
                        <div className="font-body-sm text-body-sm text-on-surface-variant">
                            Showing {filteredSessions.length} of {sessions.length}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

Index.layout = (page) => (
    <AdminLayout>
        <Head>
            <title>Active Sessions</title>
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        </Head>
        {page}
    </AdminLayout>
);