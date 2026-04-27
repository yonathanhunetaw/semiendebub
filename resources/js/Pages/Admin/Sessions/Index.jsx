import AdminLayout from "@/Layouts/AdminLayout";
import { Head, router, usePage } from "@inertiajs/react";
import { Typography, Paper } from "@mui/material";

export default function Index({ sessions = [] }) {
    const { flash = {} } = usePage().props;

    const handleDelete = (id, isCurrent) => {
        const message = isCurrent
            ? "This is your current session. You will be logged out. Continue?"
            : "Force logout this user?";

        if (confirm(message)) {
            router.delete(route("admin.sessions.destroy", id));
        }
    };

    return (
        <>
            <div className="flex flex-col gap-2 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <Typography
                    variant="h5"
                    sx={{
                        color: '#ffffff',
                        fontWeight: 700,
                        letterSpacing: '-0.2px',
                        fontFamily: '"Roboto","Arial",sans-serif'
                    }}
                >
                    Active Sessions
                </Typography>
                <span className="font-mono text-sm text-gray-400">
                    Total: {sessions.length}
                </span>
            </div>

            {flash?.message && (
                <div className="p-4 mb-6 text-green-400 border rounded-lg bg-green-500/10 border-green-500/20">
                    {flash.message}
                </div>
            )}

            <Paper
                elevation={0}
                sx={{
                    backgroundColor: '#272727',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden'
                }}
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs tracking-wider text-gray-400 uppercase border-b border-white/10 bg-white/5">
                                <th className="p-4 font-semibold">Status</th>
                                <th className="p-4 font-semibold">User / Role</th>
                                {/* Hidden on Mobile (xs), visible on Tablet (sm) and up */}
                                <th className="hidden p-4 font-semibold sm:table-cell">IP & Device</th>
                                {/* Hidden on Mobile and Tablet, visible on Computer (md) and up */}
                                <th className="hidden p-4 font-semibold md:table-cell">Expires</th>
                                <th className="p-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {sessions.map((s) => (
                                <tr key={s.id} className="transition-colors hover:bg-white/5">
                                    <td className="p-4">
                                        {s.is_live ? (
                                            <div className="flex items-center text-sm font-medium text-green-400">
                                                <span className="relative flex w-2 h-2 mr-2">
                                                    <span className="absolute inline-flex w-full h-full bg-green-400 rounded-full opacity-75 animate-ping"></span>
                                                    <span className="relative inline-flex w-2 h-2 bg-green-500 rounded-full"></span>
                                                </span>
                                                <span className="hidden xs:inline">Live</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center text-sm text-gray-500">
                                                <span className="w-2 h-2 mr-2 bg-gray-600 rounded-full"></span>
                                                <span className="text-[10px] sm:text-sm">{s.last_active_human}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm font-bold text-gray-200 sm:text-base">
                                            {s.user?.first_name ? `${s.user.first_name} ${s.user.last_name}` : "Guest"}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-[10px] sm:text-xs text-gray-500">
                                                {s.user?.email || `ID: ${String(s.id).substring(0, 8)}`}
                                            </span>
                                            <span className="text-[10px] uppercase px-1.5 py-0.5 bg-white/10 border border-white/10 rounded text-gray-400 font-mono">
                                                {s.user?.role || "Visitor"}
                                            </span>
                                        </div>
                                    </td>
                                    {/* Responsive IP Cell */}
                                    <td className="hidden p-4 sm:table-cell">
                                        <div className="inline-block px-2 py-1 mb-1 font-mono text-xs text-blue-400 rounded bg-blue-400/10">
                                            {s.ip_address}
                                        </div>
                                        <div className="text-[10px] text-gray-500 truncate max-w-[120px] lg:max-w-[180px]" title={s.user_agent}>
                                            {s.user_agent}
                                        </div>
                                    </td>
                                    {/* Responsive Expiry Cell */}
                                    <td className="hidden p-4 md:table-cell">
                                        <div className="text-sm text-gray-300">{s.expires_at}</div>
                                        {s.remember_me && (
                                            <div className="text-[10px] text-orange-400 font-bold uppercase">
                                                Persistent
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2 sm:gap-3">
                                            {s.is_current && (
                                                <span className="text-[9px] sm:text-[10px] bg-indigo-600 text-white px-1.5 sm:px-2 py-1 rounded font-bold uppercase whitespace-nowrap">
                                                    You
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handleDelete(s.id, s.is_current)}
                                                className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-bold transition-all border border-red-500/20"
                                            >
                                                {/* On very small screens, show a generic icon/short text if needed, but keeping Terminate here */}
                                                Terminate
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Paper>
        </>
    );
}

Index.layout = (page) => (
    <AdminLayout>
        <Head title="Session Management" />
        {page}
    </AdminLayout>
);
