import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, usePage } from '@inertiajs/react';

export default function Index({ sessions }) {
    const { flash } = usePage().props;

    const handleDelete = (id, isCurrent) => {
        const message = isCurrent 
            ? "This is your current session. You will be logged out. Continue?" 
            : "Force logout this user?";
            
        if (confirm(message)) {
            router.delete(route('admin.sessions.destroy', id));
        }
    };

    return (
        <AuthenticatedLayout>
            <Head title="Session Management" />

            <div className="py-12">
                <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
                    {flash.success && (
                        <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
                            {flash.success}
                        </div>
                    )}

                    <div className="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                        <div className="p-6 text-gray-900">
                            <h3 className="text-lg font-bold mb-4">Active Sessions</h3>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b">
                                            <th className="p-3">User</th>
                                            <th className="p-3">IP Address</th>
                                            <th className="p-3">Expires At</th>
                                            <th className="p-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sessions.map((s) => (
                                            <tr key={s.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3">
                                                    <div className="font-medium">{s.user?.name || 'Guest'}</div>
                                                    <div className="text-sm text-gray-500">{s.user?.email || s.id.substring(0, 8)}</div>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                                                        {s.ip_address}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-sm">{s.expires_at}</td>
                                                <td className="p-3 text-right">
                                                    {s.is_current && (
                                                        <span className="mr-3 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">
                                                            Current
                                                        </span>
                                                    )}
                                                    <button 
                                                        onClick={() => handleDelete(s.id, s.is_current)}
                                                        className="text-red-600 hover:underline text-sm font-bold"
                                                    >
                                                        Terminate
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}