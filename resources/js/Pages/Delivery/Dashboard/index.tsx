import Layout from '@/Layouts/AdminLayout';
import {Head} from '@inertiajs/react';

const todayStops = [
    {
        id: 'DLV-1842',
        customer: 'Getu Market',
        address: 'Bole, Addis Ababa',
        window: '09:30 - 11:00',
        status: 'On the way',
    },
    {
        id: 'DLV-1845',
        customer: 'Tena Pharmacy',
        address: 'Kazanchis, Addis Ababa',
        window: '11:30 - 13:00',
        status: 'Ready',
    },
    {
        id: 'DLV-1849',
        customer: 'Lemlem Foods',
        address: 'Sarbet, Addis Ababa',
        window: '13:30 - 15:00',
        status: 'Pending',
    },
];

const activeShipments = [
    {id: 'PK-9021', weight: '12.4 kg', distance: '6.2 km', eta: '18 min'},
    {id: 'PK-9044', weight: '8.1 kg', distance: '10.5 km', eta: '32 min'},
    {id: 'PK-9050', weight: '15.8 kg', distance: '4.9 km', eta: '12 min'},
];

export default function index() {
    return (
        <Layout>
            <Head title="Delivery Dashboard"/>
            <div className="relative min-h-screen pb-20">
                <div className="px-6 pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-slate-500">Live Dispatch</p>
                            <h1 className="text-2xl font-semibold text-slate-900">Delivery Dashboard</h1>
                        </div>
                        <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            On shift
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-xs text-slate-500">Today Stops</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">14</p>
                            <p className="mt-1 text-xs text-slate-500">3 completed, 11 remaining</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-xs text-slate-500">Packages In Van</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">32</p>
                            <p className="mt-1 text-xs text-slate-500">Next drop in 18 min</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <p className="text-xs text-slate-500">Distance Left</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">27.6 km</p>
                            <p className="mt-1 text-xs text-slate-500">ETA 4:40 PM</p>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-5">
                        <div className="lg:col-span-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-sm font-semibold text-slate-900">Next Stops</h2>
                                    <button className="text-xs font-semibold text-emerald-700">View route</button>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {todayStops.map((stop) => (
                                        <div key={stop.id} className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                                            <div>
                                                <p className="text-xs font-semibold text-slate-500">{stop.id}</p>
                                                <p className="text-sm font-semibold text-slate-900">{stop.customer}</p>
                                                <p className="text-xs text-slate-500">{stop.address}</p>
                                                <p className="text-xs text-slate-500">Window: {stop.window}</p>
                                            </div>
                                            <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                                                {stop.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2 space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <h2 className="text-sm font-semibold text-slate-900">Active Shipments</h2>
                                <div className="mt-4 space-y-3">
                                    {activeShipments.map((shipment) => (
                                        <div key={shipment.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3">
                                            <div>
                                                <p className="text-xs font-semibold text-slate-500">{shipment.id}</p>
                                                <p className="text-sm text-slate-900">{shipment.weight}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-500">{shipment.distance}</p>
                                                <p className="text-xs font-semibold text-emerald-700">{shipment.eta}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                                <h2 className="text-sm font-semibold text-slate-900">Live Map</h2>
                                <div className="mt-3 h-40 rounded-xl border border-dashed border-emerald-200 bg-white p-4 text-xs text-emerald-600">
                                    Map preview placeholder (ETA clusters, driver location, traffic)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex max-w-lg items-center justify-around px-6 py-3 text-xs font-semibold text-slate-600">
                        <button className="rounded-full bg-emerald-600 px-4 py-2 text-white shadow">Home</button>
                        <button className="rounded-full px-4 py-2 hover:bg-slate-100">Routes</button>
                        <button className="rounded-full px-4 py-2 hover:bg-slate-100">Profile</button>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
