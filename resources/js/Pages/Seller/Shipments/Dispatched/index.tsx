import React, { useEffect, useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";

interface Vehicle {
    id: string;
    name: string;
    plate: string;
    max_cbm: number;
    payload_kg: number;
}

interface ManifestItem {
    id: number;
    name: string;
    sku: string;
    quantity: number;
    unit: string;
    cbm: number;
}

interface Props {
    transfer_id: number;
    reference: string;
    origin: { name: string; detail: string };
    destination: { name: string; detail: string };
    vehicle: Vehicle;
    manifest_items: ManifestItem[];
    total_cbm: number;
    total_cartons: number;
    driver: { name: string; phone: string };
    gate_pass: string;
    eta: string;
    est_mins: number;
    transit_pct: number;
}

function Confetti() {
    const [pieces, setPieces] = useState<any[]>([]);
    useEffect(() => {
        const colors = ["#c2410c", "#ea580c", "#fed7aa", "#fef3c7", "#fff"];
        setPieces(
            Array.from({ length: 32 }).map((_, i) => ({
                id: i,
                size: Math.floor(Math.random() * 6) + 4,
                left: Math.floor(Math.random() * 90) + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                dur: (Math.random() * 1.5 + 1.2).toFixed(2),
                delay: (Math.random() * 0.4).toFixed(2),
                rot1: Math.floor(Math.random() * 360),
                rot2: Math.floor(Math.random() * 720) - 360,
                ty: Math.floor(Math.random() * 45) + 40,
                tx: Math.floor(Math.random() * 40) - 20,
            }))
        );
    }, []);
    return (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
            <style>{`
                @keyframes confetti-fall {
                    0%   { top: -20px; opacity: 0.9; }
                    70%  { opacity: 0.9; }
                    100% { opacity: 0; }
                }
            `}</style>
            {pieces.map(p => (
                <div key={p.id} style={{
                    position: "absolute", top: "-20px", left: `${p.left}%`,
                    width: p.size, height: p.size * 1.5, backgroundColor: p.color,
                    borderRadius: 2, opacity: 0,
                    transform: `rotate(${p.rot1}deg)`,
                    animation: `confetti-fall ${p.dur}s cubic-bezier(.25,.46,.45,.94) ${p.delay}s forwards`,
                }} />
            ))}
        </div>
    );
}

export default function SellerReplenishDispatched({
    reference, origin, destination, vehicle, manifest_items,
    total_cbm, total_cartons, driver, gate_pass, eta, est_mins, transit_pct,
}: Props) {
    const [manifestOpen, setManifestOpen] = useState(false);

    return (
        <>
            <Head title="Dispatched">
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
            </Head>
            <Confetti />

            {/* Top Context Strip */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#c2410c] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shipment</p>
                        <p className="text-[15px] font-bold text-gray-900 leading-tight">En Route</p>
                    </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-orange-100 text-[#c2410c] text-[10px] font-bold font-mono border border-orange-200/60">{reference}</span>
            </div>

            <div className="px-3.5 pt-4 pb-28 space-y-3">

                {/* Success Hero */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#c2410c] via-[#ea580c] to-[#9a3412] p-5 text-white shadow-md">
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none"></div>
                    <div className="absolute right-12 -top-4 w-20 h-20 rounded-full bg-amber-400/20 blur-lg pointer-events-none"></div>
                    <div className="relative z-10 flex flex-col items-center text-center py-2">
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3 shadow-lg">
                            <span className="material-symbols-outlined text-white text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        </div>
                        <h2 className="text-[22px] font-bold leading-tight">Shipment Dispatched!</h2>
                        <p className="text-[13px] text-orange-100 mt-1">Cargo is en route to destination</p>
                        <div className="mt-3 px-3 py-1 bg-black/20 rounded-full">
                            <span className="font-mono text-[11px] font-bold text-amber-200 tracking-wider">{reference}</span>
                        </div>
                    </div>
                    <div className="relative z-10 mt-4 pt-3 border-t border-white/15 grid grid-cols-3 text-center gap-1">
                        <div>
                            <p className="text-[11px] font-bold text-white">{total_cartons}</p>
                            <p className="text-[9px] text-orange-200 uppercase">Cartons</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-amber-200">{total_cbm.toFixed(1)} m³</p>
                            <p className="text-[9px] text-orange-200 uppercase">Volume</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-white">{est_mins} min</p>
                            <p className="text-[9px] text-orange-200 uppercase">Est. ETA</p>
                        </div>
                    </div>
                </div>

                {/* Digital Gate Pass */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[40px] text-gray-800">qr_code_2</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Digital Gate Pass</p>
                            <p className="text-[18px] font-bold font-mono text-gray-900 tracking-widest">{gate_pass}</p>
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-orange-100 text-[#c2410c] text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#c2410c] animate-pulse"></span>
                                EN ROUTE
                            </span>
                        </div>
                        <button className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[18px] text-slate-500">share</span>
                        </button>
                    </div>
                </div>

                {/* Live Transit Progress */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#c2410c] animate-pulse"></span>
                            <p className="text-[13px] font-bold text-gray-900">Live Transit Progress</p>
                        </div>
                        <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200/60">
                            <span className="material-symbols-outlined text-[#c2410c] text-[13px]">schedule</span>
                            <span className="text-[11px] font-bold text-[#c2410c]">ETA {eta}</span>
                        </div>
                    </div>
                    <div className="relative py-3 mb-2">
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#c2410c] to-[#ea580c] rounded-full transition-all" style={{ width: `${transit_pct}%` }}></div>
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${Math.max(5, Math.min(transit_pct, 92))}%`, transform: 'translate(-50%, -50%)' }}>
                            <div className="w-8 h-8 rounded-full bg-[#c2410c] border-2 border-white shadow-md flex items-center justify-center">
                                <span className="material-symbols-outlined text-white text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-slate-400">warehouse</span>
                            <span className="text-[11px] text-slate-400 font-medium">{origin.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-400 font-medium">{destination.name}</span>
                            <span className="material-symbols-outlined text-[13px] text-slate-400">storefront</span>
                        </div>
                    </div>
                </div>

                {/* Driver & Vehicle */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Driver & Fleet</p>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#c2410c] to-[#9a3412] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-white text-[20px]">person</span>
                            </div>
                            <div>
                                <p className="text-[13px] font-bold text-gray-900">{driver.name}</p>
                                <p className="text-[11px] font-mono text-slate-400">{vehicle.plate}</p>
                                <p className="text-[10px] text-slate-400">{vehicle.name}</p>
                            </div>
                        </div>
                        <a href={`tel:${driver.phone}`}
                            className="w-11 h-11 rounded-xl bg-[#c2410c] flex items-center justify-center shadow-sm active:scale-95 transition-transform">
                            <span className="material-symbols-outlined text-white text-[20px]">call</span>
                        </a>
                    </div>
                </div>

                {/* Inbound Dock Notified */}
                <div className="bg-blue-50/70 rounded-2xl border border-blue-100 p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-blue-500 text-[22px] shrink-0 mt-0.5">notifications_active</span>
                    <div>
                        <p className="text-[12px] font-bold text-gray-900">Store Dock Standby Notified</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">Receiving SK has cleared the inbound bay. Digital unsealing PIN generated and sent.</p>
                    </div>
                </div>

                {/* Manifest Accordion */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <button onClick={() => setManifestOpen(o => !o)}
                        className="w-full flex items-center justify-between p-4">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#c2410c] text-[18px]">inventory_2</span>
                            <p className="text-[13px] font-bold text-gray-900">Manifest ({manifest_items.length} items)</p>
                        </div>
                        <span className={`material-symbols-outlined text-slate-400 text-[20px] transition-transform ${manifestOpen ? "rotate-180" : ""}`}>expand_more</span>
                    </button>
                    {manifestOpen && (
                        <div className="px-4 pb-4 space-y-1.5 border-t border-slate-50">
                            {manifest_items.map(item => (
                                <div key={item.id} className="flex items-center justify-between py-1.5">
                                    <p className="text-[12px] font-semibold text-gray-800">{item.name}</p>
                                    <p className="text-[12px] font-bold text-[#c2410c] font-mono">{item.quantity} {item.unit}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                    <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#c2410c] text-white font-bold text-[14px] shadow-sm active:scale-95 transition-transform">
                        <span className="material-symbols-outlined text-[18px]">near_me</span>
                        Track Live
                    </button>
                    <button onClick={() => router.get(route("seller.dashboard"))}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-slate-200 text-gray-700 font-bold text-[14px] active:scale-95 transition-transform">
                        Return to Home
                    </button>
                </div>
            </div>
        </>
    );
}

SellerReplenishDispatched.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
