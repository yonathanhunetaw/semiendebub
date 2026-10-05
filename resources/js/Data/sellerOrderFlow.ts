/**
 * Sample data and shared types for the seller order lifecycle:
 * cart → order confirmation → to pay → paid → pick & pack.
 *
 * None of this is persisted. The order domain has no backend yet, so these
 * screens are a working layout preview driven from one place — keeping the
 * pipeline tiles, the order list and the detail pages telling the same story.
 * Replace this module with server props when the domain lands.
 */

import { statusTone, type Tone } from "@/Components/Shared/ui";

/**
 * Bottom offset for a page's own sticky action bar.
 *
 * SellerLayout pins the bottom nav at `bottom: 0` with a 70px bar plus a 12px
 * inset, so anything at `bottom-0` lands underneath it. Sticky bars sit above
 * that, clearing the iOS home indicator too.
 */
export const ABOVE_NAV = "calc(90px + env(safe-area-inset-bottom))";

/** Where a line is fulfilled from. */
export type Fulfillment = "local" | "hub";

export const FULFILLMENT_LABELS: Record<Fulfillment, { title: string; badge: string; badgeClass: string }> = {
    local: {
        title: "Store & Remote Hub",
        badge: "Local + Remote",
        badgeClass: "bg-info text-on-info",
    },
    hub: {
        title: "Warehouse",
        badge: "Hub Consolidation",
        badgeClass: "bg-warning-container text-on-warning-container",
    },
};

export interface OrderLine {
    id: number;
    name: string;
    variant: string;
    unitPrice: number;
    wasPrice?: number;
    quantity: number;
    fulfillment: Fulfillment;
    supplier: string;
    /** Set when the line cannot be picked from the shop floor. */
    inStore: boolean;
}

export type OrderStage = "to_pay" | "paid" | "packing" | "to_deliver" | "delivered" | "canceled";

export interface SellerOrder {
    id: number;
    reference: string;
    customer: string;
    stage: OrderStage;
    placed: string;
    /** Minutes left before an unpaid order lapses; only meaningful for to_pay. */
    expiresInMinutes?: number;
    lines: OrderLine[];
    /** Where the load is going, shown on the confirmation and to-pay screens. */
    destination: {
        name: string;
        kind: string;
        vehicle: string;
        driver: string;
        address: string;
    };
    additionalCharges: number;
    shippingFee: number;
}

/**
 * Bordered soft chip per tone (literal strings so the JIT compiler keeps them).
 * Stage colors come from the shared status map, so an order stage reads the
 * same as the matching status elsewhere.
 */
const STAGE_CHIP: Record<Tone, string> = {
    primary: "bg-primary-container/60 text-on-primary-container border-primary/30",
    tertiary: "bg-tertiary-container/60 text-on-tertiary-container border-tertiary/30",
    info: "bg-info-container/60 text-on-info-container border-info/30",
    success: "bg-success-container/60 text-on-success-container border-success/30",
    warning: "bg-warning-container/60 text-on-warning-container border-warning/30",
    error: "bg-error-container/60 text-on-error-container border-error/30",
    neutral: "bg-surface-container text-on-surface-variant border-outline-variant",
};

const stageChip = (stage: OrderStage) => STAGE_CHIP[statusTone(stage)];

export const STAGE_META: Record<OrderStage, { label: string; chip: string }> = {
    to_pay: { label: "To pay", chip: stageChip("to_pay") },
    paid: { label: "Paid", chip: stageChip("paid") },
    packing: { label: "Pick & pack", chip: stageChip("packing") },
    to_deliver: { label: "To deliver", chip: stageChip("to_deliver") },
    delivered: { label: "Delivered", chip: stageChip("delivered") },
    canceled: { label: "Canceled", chip: stageChip("canceled") },
};

const DEFAULT_DESTINATION = {
    name: "Buna Tera",
    kind: "Terminal / Hub",
    vehicle: "Isuzu • Plate (3) 25433",
    driver: "Abebe K. • +251 91 123 4567",
    address: "Gobena street, Maryhill, Addis Ababa",
};

export const SAMPLE_ORDERS: SellerOrder[] = [
    {
        id: 1,
        reference: "SO-24817",
        customer: "Aster Mekonnen",
        stage: "to_pay",
        placed: "Today, 09:14",
        expiresInMinutes: 94,
        additionalCharges: 316.94,
        shippingFee: 0,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 101,
                name: "Ambo Mineral Water 1L — Case of 12",
                variant: "Carton / 12 pcs",
                unitPrice: 540,
                wasPrice: 620,
                quantity: 4,
                fulfillment: "local",
                supplier: "Ambo Beverages",
                inStore: true,
            },
            {
                id: 102,
                name: "Ethiopian Highland Coffee — Roasted Beans",
                variant: "1kg / Medium roast",
                unitPrice: 1280,
                quantity: 2,
                fulfillment: "hub",
                supplier: "Yirgacheffe Union",
                inStore: false,
            },
        ],
    },
    {
        id: 2,
        reference: "SO-24816",
        customer: "Bete Tsehay Retail",
        stage: "to_pay",
        placed: "Today, 08:02",
        expiresInMinutes: 36,
        additionalCharges: 1240,
        shippingFee: 350,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 103,
                name: "Sunflower Cooking Oil 5L",
                variant: "Jerrycan / 5L",
                unitPrice: 1450,
                wasPrice: 1600,
                quantity: 12,
                fulfillment: "local",
                supplier: "Addis Oils",
                inStore: true,
            },
            {
                id: 104,
                name: "White Sugar — 50kg Sack",
                variant: "Sack / 50kg",
                unitPrice: 4200,
                quantity: 3,
                fulfillment: "hub",
                supplier: "Wonji Sugar",
                inStore: false,
            },
        ],
    },
    {
        id: 3,
        reference: "SO-24813",
        customer: "Kality Depot",
        stage: "paid",
        placed: "Today, 07:20",
        additionalCharges: 480,
        shippingFee: 0,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 105,
                name: "Teff Flour — Premium Grade",
                variant: "Sack / 25kg",
                unitPrice: 3100,
                quantity: 6,
                fulfillment: "local",
                supplier: "Shola Mills",
                inStore: true,
            },
            {
                id: 106,
                name: "Berbere Spice Blend",
                variant: "Tin / 2kg",
                unitPrice: 890,
                quantity: 10,
                fulfillment: "hub",
                supplier: "Merkato Spice Co.",
                inStore: false,
            },
        ],
    },
    {
        id: 4,
        reference: "SO-24811",
        customer: "Dawit Haile",
        stage: "packing",
        placed: "Yesterday, 16:45",
        additionalCharges: 210,
        shippingFee: 150,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 107,
                name: "Laundry Soap Bar — Bulk",
                variant: "Box / 48 bars",
                unitPrice: 960,
                quantity: 5,
                fulfillment: "local",
                supplier: "Repi Soap",
                inStore: true,
            },
        ],
    },
    {
        id: 5,
        reference: "SO-24808",
        customer: "Merkato Wholesale",
        stage: "to_deliver",
        placed: "Yesterday, 11:20",
        additionalCharges: 2400,
        shippingFee: 900,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 108,
                name: "Pasta — Macaroni 500g",
                variant: "Carton / 20 packs",
                unitPrice: 720,
                quantity: 28,
                fulfillment: "local",
                supplier: "Kokeb Foods",
                inStore: true,
            },
        ],
    },
    {
        id: 6,
        reference: "SO-24799",
        customer: "Sunrise Minimart",
        stage: "delivered",
        placed: "27 Sep, 10:31",
        additionalCharges: 0,
        shippingFee: 0,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 109,
                name: "Bottled Water 500ml",
                variant: "Shrink / 24 pcs",
                unitPrice: 310,
                quantity: 9,
                fulfillment: "local",
                supplier: "Ambo Beverages",
                inStore: true,
            },
        ],
    },
    {
        id: 7,
        reference: "SO-24783",
        customer: "Kality Depot",
        stage: "canceled",
        placed: "25 Sep, 15:12",
        additionalCharges: 0,
        shippingFee: 0,
        destination: DEFAULT_DESTINATION,
        lines: [
            {
                id: 110,
                name: "Tomato Paste 400g",
                variant: "Carton / 24 tins",
                unitPrice: 880,
                quantity: 6,
                fulfillment: "hub",
                supplier: "Merkato Spice Co.",
                inStore: false,
            },
        ],
    },
];

/* ----------------------------------------------------------
 | Money + totals
 |----------------------------------------------------------*/

export const birr = (amount: number): string =>
    `ETB ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const lineTotal = (line: OrderLine): number => line.unitPrice * line.quantity;

export const subtotal = (order: SellerOrder): number =>
    order.lines.reduce((sum, line) => sum + lineTotal(line), 0);

export const orderTotal = (order: SellerOrder): number =>
    subtotal(order) + order.additionalCharges + order.shippingFee;

export const savings = (order: SellerOrder): number =>
    order.lines.reduce(
        (sum, line) => sum + (line.wasPrice ? (line.wasPrice - line.unitPrice) * line.quantity : 0),
        0,
    );

/** Group an order's lines into the two fulfillment bands. */
export function groupByFulfillment(lines: OrderLine[]): Array<[Fulfillment, OrderLine[]]> {
    const groups: Array<[Fulfillment, OrderLine[]]> = [];

    (["local", "hub"] as Fulfillment[]).forEach((key) => {
        const matching = lines.filter((line) => line.fulfillment === key);
        if (matching.length) groups.push([key, matching]);
    });

    return groups;
}

export const findOrder = (reference: string): SellerOrder | undefined =>
    SAMPLE_ORDERS.find((order) => order.reference === reference);

/** `01 : 34 : 51` from a minute count. */
export function countdownParts(totalSeconds: number): string {
    const safe = Math.max(0, totalSeconds);
    const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
    const seconds = String(safe % 60).padStart(2, "0");

    return `${hours} : ${minutes} : ${seconds}`;
}

/* ----------------------------------------------------------
 | Payment providers
 |----------------------------------------------------------*/

export interface Provider {
    id: string;
    name: string;
    note?: string;
    initials: string;
    /**
     * Tailwind classes for the avatar chip. These approximate each bank's or
     * wallet's own brand color, so they stay fixed palette colors on purpose
     * (a bank is not a status or the module accent; see docs/DESIGN.md).
     */
    tone: string;
    /** Wallets are settled by phone number, banks by account number. */
    settleBy: "account" | "phone";
    /**
     * The store's own receiving account on this rail. Prefilled into a split
     * leg — these are the shop's details, not something the seller types per
     * order. Sample values; replace with the store's real payout settings.
     */
    account: string;
}

/** Account holder for every receiving account above. */
export const ACCOUNT_HOLDER = "Semien Debub Trading PLC";

export const BANKS: Provider[] = [
    { id: "cbe", name: "Commercial Bank of Ethiopia (CBE)", note: "State commercial bank", initials: "CBE", tone: "bg-purple-100 text-purple-800", settleBy: "account", account: "1000 2145 88721" },
    { id: "awash", name: "Awash Bank", note: "Private commercial bank", initials: "AB", tone: "bg-blue-100 text-blue-800", settleBy: "account", account: "0130 4412 09883" },
    { id: "boa", name: "Bank of Abyssinia", note: "Private commercial bank", initials: "BOA", tone: "bg-amber-100 text-amber-800", settleBy: "account", account: "1234 5667 09112" },
    { id: "dashen", name: "Dashen Bank", note: "Private commercial bank", initials: "DB", tone: "bg-sky-100 text-sky-800", settleBy: "account", account: "5041 2288 31007" },
    { id: "coop", name: "Coopbank of Oromia", note: "Cooperative bank", initials: "COOP", tone: "bg-emerald-100 text-emerald-800", settleBy: "account", account: "1015 6620 04473" },
    { id: "abay", name: "Abay Bank", initials: "AYB", tone: "bg-blue-50 text-blue-700", settleBy: "account", account: "0451 7723 90118" },
    { id: "amhara", name: "Amhara Bank", initials: "AMB", tone: "bg-orange-100 text-orange-800", settleBy: "account", account: "9900 3317 22045" },
    { id: "berhan", name: "Berhan Bank", initials: "BRB", tone: "bg-yellow-100 text-yellow-800", settleBy: "account", account: "0620 1145 77390" },
    { id: "bunna", name: "Bunna Bank", initials: "BNB", tone: "bg-stone-100 text-stone-800", settleBy: "account", account: "1102 9983 41260" },
    { id: "enat", name: "Enat Bank", initials: "EB", tone: "bg-pink-100 text-pink-800", settleBy: "account", account: "0810 4432 19775" },
    { id: "hibret", name: "Hibret Bank", note: "formerly United Bank", initials: "HB", tone: "bg-orange-100 text-orange-900", settleBy: "account", account: "1340 7765 20391" },
    { id: "hijra", name: "Hijra Bank", initials: "HJB", tone: "bg-green-100 text-green-800", settleBy: "account", account: "2201 5590 66104" },
    { id: "lion", name: "Lion International Bank", initials: "LIB", tone: "bg-amber-100 text-amber-900", settleBy: "account", account: "3009 8871 45220" },
    { id: "nib", name: "Nib International Bank", initials: "NIB", tone: "bg-blue-100 text-blue-700", settleBy: "account", account: "5001 2234 77860" },
    { id: "oromia", name: "Oromia Bank", initials: "OB", tone: "bg-red-100 text-red-700", settleBy: "account", account: "0170 6648 23915" },
    { id: "siinqee", name: "Siinqee Bank", initials: "SQB", tone: "bg-emerald-100 text-emerald-900", settleBy: "account", account: "4400 1129 88537" },
    { id: "tsehay", name: "Tsehay Bank", initials: "TSB", tone: "bg-yellow-100 text-yellow-900", settleBy: "account", account: "7720 3341 05628" },
    { id: "wegagen", name: "Wegagen Bank", initials: "WB", tone: "bg-red-100 text-red-900", settleBy: "account", account: "0960 5583 71442" },
    { id: "zamzam", name: "ZamZam Bank", initials: "ZZB", tone: "bg-emerald-100 text-emerald-800", settleBy: "account", account: "6610 2274 39085" },
    { id: "zemen", name: "Zemen Bank", initials: "ZB", tone: "bg-purple-100 text-purple-900", settleBy: "account", account: "1290 4417 66203" },
];

export const WALLETS: Provider[] = [
    { id: "telebirr", name: "Telebirr", note: "Ethio Telecom wallet", initials: "tb", tone: "bg-sky-500 text-white", settleBy: "phone", account: "0912 445 780" },
    { id: "mpesa", name: "M-Pesa Ethiopia", note: "Safaricom mobile money", initials: "M", tone: "bg-red-600 text-white", settleBy: "phone", account: "0700 331 902" },
    { id: "cbebirr", name: "CBE Birr", note: "Commercial Bank of Ethiopia", initials: "CBE", tone: "bg-purple-700 text-white", settleBy: "phone", account: "0911 268 344" },
    { id: "amole", name: "Amole (Dashen Bank)", note: "Dashen digital wallet", initials: "A", tone: "bg-blue-600 text-white", settleBy: "phone", account: "0913 870 215" },
    { id: "ebirr", name: "E-Birr", note: "E-Birr mobile wallet", initials: "EB", tone: "bg-emerald-600 text-white", settleBy: "phone", account: "0918 552 617" },
];

export const ALL_PROVIDERS: Provider[] = [...BANKS, ...WALLETS];

export const findProvider = (id: string): Provider | undefined =>
    ALL_PROVIDERS.find((provider) => provider.id === id);

/* ----------------------------------------------------------
 | Split payments
 |----------------------------------------------------------*/

/** One leg of a split payment the seller is collecting. */
export interface PaymentLeg {
    /** Local id, stable for React keys. */
    key: string;
    providerId: string;
    /** Account number for a bank, phone number for a wallet. */
    reference: string;
    accountName: string;
    amount: number;
}

/**
 * Render the legs as a block a seller can paste into a chat.
 *
 * This is the artefact the "pay separately" flow exists to produce — the
 * customer needs the destination details and the exact split in one message.
 */
export function formatLegsForCopy(
    legs: PaymentLeg[],
    order: { reference: string; customer: string },
): string {
    const lines: string[] = [
        `Payment details — ${order.reference}`,
        `Customer: ${order.customer}`,
        "",
    ];

    legs.forEach((leg, index) => {
        const provider = findProvider(leg.providerId);
        const label = provider?.settleBy === "phone" ? "Phone" : "Account";

        lines.push(`${index + 1}. ${provider?.name ?? leg.providerId}`);
        lines.push(`   ${label}: ${leg.reference || "—"}`);
        lines.push(`   Name: ${leg.accountName || ACCOUNT_HOLDER}`);
        lines.push(`   Amount: ${birr(leg.amount)}`);
        lines.push("");
    });

    lines.push(`Total: ${birr(legs.reduce((sum, leg) => sum + leg.amount, 0))}`);

    return lines.join("\n");
}

/* ----------------------------------------------------------
 | Pick & pack
 |----------------------------------------------------------*/

/** Where a picked line gets staged. */
export type PackDestination = "store" | "remote" | "warehouse";

export const PACK_DESTINATIONS: Array<{ id: PackDestination; label: string; hint: string; icon: string }> = [
    { id: "store", label: "Store", hint: "Packed on the shop floor", icon: "storefront" },
    { id: "remote", label: "Remote", hint: "Packed at the remote unit", icon: "warehouse" },
    { id: "warehouse", label: "Warehouse", hint: "Consolidated at the hub", icon: "inventory" },
];

/**
 * How a line will be sourced.
 *
 * `pick_in_store` is only offered when the item is actually on the floor;
 * otherwise it has to be raised as a store order first and picked once that
 * delivery lands.
 */
export type SourcePlan = "pick_in_store" | "store_order";

export interface PickPackLine {
    lineId: number;
    destination: PackDestination;
    plan: SourcePlan;
    picked: boolean;
    packed: boolean;
}

/** Starting plan for a line: pick it if it is on the floor, else order it in. */
export function initialPickPack(line: OrderLine): PickPackLine {
    return {
        lineId: line.id,
        destination: line.fulfillment === "local" ? "store" : "warehouse",
        plan: line.inStore ? "pick_in_store" : "store_order",
        picked: false,
        packed: false,
    };
}

/* ----------------------------------------------------------
 | Split allocation presets
 |----------------------------------------------------------*/

export type SplitPreset = "equal" | "half" | "clear";

/**
 * Spread `total` across `legs` according to a preset.
 *
 * Every preset lands exactly on the total: amounts are rounded to cents and
 * the last leg absorbs the rounding remainder, so the split always balances
 * rather than leaving a stray 0.01 behind. The seller can still edit any
 * amount afterwards.
 *
 *  - `equal` — the same share for every leg.
 *  - `half`  — the first leg takes 50%, the rest share the other 50% equally.
 *              With two legs that is a straight 50/50.
 *  - `clear` — zero everything, for entering amounts by hand.
 */
export function allocateSplit(legs: PaymentLeg[], total: number, preset: SplitPreset): PaymentLeg[] {
    if (legs.length === 0) return legs;

    if (preset === "clear") {
        return legs.map((leg) => ({ ...leg, amount: 0 }));
    }

    const cents = Math.round(total * 100);

    const shares: number[] = (() => {
        if (preset === "half" && legs.length > 1) {
            const head = Math.round(cents / 2);
            const rest = Math.floor((cents - head) / (legs.length - 1));
            return [head, ...Array(legs.length - 1).fill(rest)];
        }

        return Array(legs.length).fill(Math.floor(cents / legs.length));
    })();

    // Push any rounding remainder onto the last leg so the split is exact.
    const remainder = cents - shares.reduce((sum, share) => sum + share, 0);
    shares[shares.length - 1] += remainder;

    return legs.map((leg, index) => ({ ...leg, amount: shares[index] / 100 }));
}
