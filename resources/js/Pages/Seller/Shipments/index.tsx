import React, { useMemo, useState } from "react";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, router } from "@inertiajs/react";
import AddShipmentSheet from "@/Components/Seller/Shipments/AddShipmentSheet";
import ListTopBar, { type TabSpec } from "@/Components/Seller/ListTopBar";
import TransferCard from "@/Components/Seller/Shipments/TransferCard";
import type { LocationOption, NewShipmentInput, ScheduledTransfer } from "@/types/shipments";

interface Props {
    scheduled_transfers: ScheduledTransfer[];
    /** Real stores, so a created shipment resolves to an actual record. */
    stores?: LocationOption[];
}

const TAB_IDS = ["all", "scheduled", "pending", "en_route", "shipped", "overdue"];

/**
 * Legacy statuses behind each tab. `dispatched` and `en_route` are both "on
 * the road" and share a tab — without this a dispatched run appeared under no
 * tab but "All".
 */
const TAB_STATUSES: Record<string, string[]> = {
    scheduled: ["scheduled"],
    pending: ["pending"],
    en_route: ["dispatched", "en_route"],
    shipped: ["shipped"],
    overdue: ["overdue"],
};

/** True when a transfer belongs under the given tab. */
function inTab(status: string, tab: string): boolean {
    return tab === "all" || (TAB_STATUSES[tab] ?? []).includes(status);
}

/** Read `?tab=` so the More hub's shipment tiles can deep-link into a stage. */
function initialTab(): string {
    if (typeof window === "undefined") return "all";

    const requested = new URLSearchParams(window.location.search).get("tab");

    return requested && TAB_IDS.includes(requested) ? requested : "all";
}

/* ----------------------------------------------------------
 | Page Component
 |----------------------------------------------------------*/
export default function ReplenishIndex({ scheduled_transfers = [], stores = [] }: Props) {
    const [addOpen, setAddOpen] = useState(false);
    const [filter, setFilter] = useState<string>(initialTab);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState("");
    const [sortNewest, setSortNewest] = useState(true);
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    /**
     * Rows hidden by the trash action. There is no seller-side delete endpoint
     * for shipments, so this only clears them from the current view — it never
     * touches the record.
     */
    const [hidden, setHidden] = useState<number[]>([]);
    const transfers = useMemo(
        () => scheduled_transfers.filter(t => !hidden.includes(t.id)),
        [scheduled_transfers, hidden],
    );

    /**
     * Persist the shipment instead of only adding a local row.
     *
     * The previous version pushed a client-side object with `id: Date.now()`,
     * so the card linked to a shipment that did not exist and the manifest
     * builder 404'd. The server now creates the record and redirects straight
     * into Build.
     */
    const addShipment = (input: NewShipmentInput) => {
        const scheduledRun = `${input.scheduledDate}T${input.scheduledTime}:00`;

        /*
         * The alternate windows go with it.
         *
         * The sheet has always let the seller add "Alternate Time Windows", and
         * this call dropped them — so a run reached the 4-party gate offering a
         * single time. The driver and both docks could only accept that one time
         * or refuse, because the service rejects agreement on a slot that was
         * never proposed. The windows are what makes the gate an agreement
         * rather than an instruction.
         */
        const proposedWindows = [
            scheduledRun,
            ...(input.alternateOptions ?? [])
                .filter(w => w.date && w.time)
                .map(w => `${w.date}T${w.time}:00`),
        ].filter((slot, i, all) => all.indexOf(slot) === i);

        setSubmitting(true);
        router.post(
            route("seller.shipments.store"),
            {
                origin_store_id: Number(input.origin),
                destination_store_id: Number(input.destination),
                scheduled_for: scheduledRun,
                schedule_options: proposedWindows,
            },
            {
                onSuccess: () => setAddOpen(false),
                onFinish: () => setSubmitting(false),
            },
        );
    };

    // Tab + free-text filter, then the sort toggle from the filter button.
    const displayedTransfers = useMemo(() => {
        const needle = search.trim().toLowerCase();

        const rows = transfers.filter(t => {
            if (!inTab(t.status, filter)) return false;
            if (!needle) return true;

            return (
                t.reference.toLowerCase().includes(needle) ||
                t.origin.name.toLowerCase().includes(needle) ||
                t.destination.name.toLowerCase().includes(needle) ||
                (t.vehicle_plate ?? "").toLowerCase().includes(needle)
            );
        });

        return sortNewest ? rows : [...rows].reverse();
    }, [transfers, filter, search, sortNewest]);

    const tabs: TabSpec[] = [
        { id: "all", label: "View all" },
        { id: "scheduled", label: "Scheduled" },
        { id: "pending", label: "Pending manifest" },
        { id: "en_route", label: "En route" },
        { id: "shipped", label: "Shipped" },
        { id: "overdue", label: "Overdue" },
    ].map(tab => ({
        ...tab,
        count: tab.id === "all"
            ? transfers.length
            : transfers.filter(t => inTab(t.status, tab.id)).length,
    }));

    const leaveSelectMode = () => {
        setSelectMode(false);
        setSelected([]);
    };

    const hideSelected = () => {
        setHidden(current => [...current, ...selected]);
        leaveSelectMode();
    };

    return (
        <>
            <Head title="Shipments">
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
            </Head>

            <ListTopBar
                fallbackRoute="seller.dashboard"
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Reference, route, plate…"
                tabs={tabs}
                activeTab={filter}
                onTab={(id) => {
                    setFilter(id);
                    leaveSelectMode();
                }}
                onFilter={() => setSortNewest(current => !current)}
                filterActive={!sortNewest}
                onDelete={() => (selectMode ? leaveSelectMode() : setSelectMode(true))}
                deleteActive={selectMode}
                trailing={
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        aria-label="New shipment"
                        title="New shipment"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[999px] bg-[#c2410c] text-white shadow-sm transition-transform active:scale-90"
                    >
                        <span className="material-symbols-outlined text-[19px]">add</span>
                    </button>
                }
            />

            <div className="px-3.5 pt-3 pb-36 space-y-3">

                {!sortNewest && (
                    <p className="text-[11px] text-slate-500">Sorted oldest first</p>
                )}

                {/* ── Transfer List ── */}
                <div className="space-y-3">
                    {displayedTransfers.map(t => {
                        const checked = selected.includes(t.id);

                        if (!selectMode) {
                            return <TransferCard key={t.id} t={t} />;
                        }

                        return (
                            <div
                                key={t.id}
                                onClick={() => setSelected(current => (
                                    current.includes(t.id)
                                        ? current.filter(id => id !== t.id)
                                        : [...current, t.id]
                                ))}
                                className={`relative cursor-pointer rounded-2xl ring-2 ring-offset-2 transition-colors ${
                                    checked ? "ring-[#c2410c]" : "ring-transparent"
                                }`}
                            >
                                {/* Swallow card clicks so ticking never navigates. */}
                                <div className="pointer-events-none">
                                    <TransferCard t={t} />
                                </div>
                                <span
                                    aria-hidden="true"
                                    className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-[999px] border shadow-sm ${
                                        checked
                                            ? "border-[#c2410c] bg-[#c2410c] text-white"
                                            : "border-slate-300 bg-white"
                                    }`}
                                >
                                    {checked && (
                                        <span className="material-symbols-outlined text-[15px]">check</span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                    {displayedTransfers.length === 0 && (
                        <div className="flex flex-col items-center px-6 py-16 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[999px] bg-[#FDF0ED]">
                                <span className="material-symbols-outlined text-[40px] text-[#c2410c]">
                                    local_shipping
                                </span>
                            </div>
                            <p className="mt-4 text-[16px] font-bold text-gray-900">
                                {search ? "No matching shipments" : "No shipments in this tab"}
                            </p>
                            <p className="mt-1 text-[12px] text-slate-500">
                                {search
                                    ? "Try a different reference, route or plate."
                                    : "Runs at this stage will show up here."}
                            </p>
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="mt-4 rounded-[999px] bg-[#c2410c] px-5 py-2 text-[13px] font-bold text-white active:scale-95"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* Selection bar. Clears rows from the view only — see `hidden`. */}
            {selectMode && (
                <div className="fixed inset-x-0 bottom-[96px] z-40 mx-auto max-w-[480px] px-4">
                    <div className="flex items-center justify-between rounded-[999px] border border-slate-200 bg-white px-4 py-2.5 shadow-lg">
                        <span className="text-[12px] font-semibold text-slate-600">
                            {selected.length} selected
                        </span>
                        <button
                            type="button"
                            onClick={hideSelected}
                            disabled={selected.length === 0}
                            className="rounded-[999px] bg-rose-600 px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
                        >
                            Clear from view
                        </button>
                    </div>
                </div>
            )}

            {/* ── Dialogs ── */}
            <AddShipmentSheet
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onAdd={addShipment}
                facilities={stores}
                units={stores}
                submitting={submitting}
            />
        </>
    );
}

ReplenishIndex.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
