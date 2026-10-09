import type { FigureAction } from "@/Components/Visual/RoleFigure";
import type { IdentityKey } from "@/Components/Visual/identities";
import type { JourneyStage } from "@/Components/Visual/OrderJourney";
import type { SceneKind } from "@/Components/Visual/scenes";

/**
 * The guide: one chapter per way of working in Duka, each a list of steps.
 * A step says what happens (in the words of whoever does it), who may do it,
 * what to show while it is explained, and which real page it happens on.
 *
 * Shown by Pages/Guide/Index on admin, seller, stock keeper and delivery at
 * `/guide?chapter=…&step=…`. Every page's small "How this works" button deep
 * links here (pageGuides.ts).
 */

export type GuideApp = "admin" | "seller" | "stock_keeper" | "delivery";

export type Stage =
    | { type: "journey"; current: JourneyStage }
    | { type: "transfer"; from: string; to: string; status: "pending" | "in_transit" | "completed"; courier?: boolean; quantity?: number; unit?: string }
    | { type: "local"; status: "pending" | "in_transit" | "completed" }
    | { type: "variants" }
    | { type: "scenes"; scenes: SceneKind[] }
    | { type: "cast"; roles: IdentityKey[] };

export interface GuideLink {
    label: string;
    /** A Ziggy route name; other apps' routes resolve to their own subdomain. */
    route: string;
    params?: Record<string, string | number>;
    /** `store.show` and friends: filled with the admin's active store. */
    needsStore?: boolean;
}

export interface GuideStep {
    key: string;
    title: string;
    /** What the person doing it says. */
    say: string;
    /** Who may do this step. The first one narrates. */
    who: IdentityKey[];
    action?: FigureAction;
    stage: Stage;
    link?: GuideLink;
    /** A heading the step sits under (Moving stock has three kinds of move). */
    group?: string;
}

export interface GuideChapter {
    key: string;
    title: string;
    blurb: string;
    narrator: IdentityKey;
    steps: GuideStep[];
}

export const CHAPTERS: GuideChapter[] = [
    {
        key: "seller",
        title: "Selling",
        blurb: "From finding the item to the customer holding it, and the money handed over.",
        narrator: "seller",
        steps: [
            { key: "catalogue", title: "Find the item", who: ["seller"], action: "point", stage: { type: "scenes", scenes: ["store", "shelf"] },
                say: "I open the Store tab and search, browse a category, or scan the barcode of what the customer wants.",
                link: { label: "Open the store", route: "seller.items.index" } },
            { key: "variant", title: "Choose the variant", who: ["seller", "customer"], action: "talk", stage: { type: "variants" },
                say: "One item comes in colours, sizes and packs. Each variant has its own price and stock, so I tap the chips until it is the one they want.",
                link: { label: "Browse items", route: "seller.items.index" } },
            { key: "cart", title: "Open a cart for the customer", who: ["seller"], action: "talk", stage: { type: "scenes", scenes: ["cart"] },
                say: "A cart belongs to one customer. A customer with a TIN is an individual, so their prices include VAT.",
                link: { label: "New cart", route: "seller.carts.create" } },
            { key: "add", title: "Add to the cart", who: ["seller"], action: "walk", stage: { type: "journey", current: "cart" },
                say: "I choose cartons, boxes or pieces and add it. The cart's total follows each line I add.",
                link: { label: "Open carts", route: "seller.carts.index" } },
            { key: "checkout", title: "Check out and split the payment", who: ["seller", "customer"], action: "talk", stage: { type: "journey", current: "to_pay" },
                say: "At checkout I split the total across cash, bank and wallet, and credit if the admin gave this customer a limit.",
                link: { label: "Orders to pay", route: "seller.orders.index" } },
            { key: "confirm", title: "Confirm the money arrived", who: ["seller", "finance"], action: "point", stage: { type: "journey", current: "paid" },
                say: "Each deposit goes to its account's owner. When I see it arrive, I confirm it in my payments inbox. Then the order is paid.",
                link: { label: "Payments inbox", route: "seller.payments.inbox" } },
            { key: "pack", title: "Pick & pack", who: ["stock_keeper", "seller"], action: "walk", stage: { type: "journey", current: "packing" },
                say: "Once it is paid I pick every line, from the shelf, the floor or the Remote Hub, and pack the order.",
                link: { label: "Orders to pack", route: "seller.orders.index" } },
            { key: "deliver", title: "Deliver or hand over", who: ["delivery", "customer"], action: "walk", stage: { type: "journey", current: "to_deliver" },
                say: "A courier takes the packed order to the customer, or the customer collects it at the counter.",
                link: { label: "Deliveries", route: "delivery.delivery.index" } },
            { key: "delivered", title: "In the customer's hands", who: ["customer"], action: "wave", stage: { type: "journey", current: "delivered" },
                say: "I have it. The order's custody log shows every hand it passed through, with where and when.",
                link: { label: "All orders", route: "seller.orders.index" } },
            { key: "balance", title: "Hand the money over", who: ["seller", "finance"], action: "talk", stage: { type: "scenes", scenes: ["pay", "paid"] },
                say: "Cash I took and deposits I confirmed sit on my balance until I hand them to a settlement account and its owner confirms.",
                link: { label: "My balance", route: "seller.balance.index" } },
        ],
    },
    {
        key: "stock_keeper",
        title: "Keeping stock",
        blurb: "Receiving freight, keeping shelves full, packing orders and sending stock on.",
        narrator: "stock_keeper",
        steps: [
            { key: "receive", title: "Receive a shipment", who: ["stock_keeper", "delivery"], action: "point",
                stage: { type: "transfer", from: "Main Hub · Hub A", to: "Main Store · Remote Hub", status: "completed", courier: true, quantity: 120, unit: "cartons" },
                say: "When the driver arrives I check every line against the manifest and sign. The stock is ours from that moment.",
                link: { label: "Shipments", route: "stock_keeper.shipments.index" } },
            { key: "shelve", title: "Shelve from the floor", who: ["stock_keeper"], action: "walk", stage: { type: "local", status: "in_transit" },
                say: "When a shelf drops below its refill line, the floor refills it straight away. No approval: I just carry it across.",
                link: { label: "Shelving list", route: "stock_keeper.shelving.index" } },
            { key: "alerts", title: "Watch the low-stock alerts", who: ["stock_keeper", "store_manager"], action: "talk", stage: { type: "scenes", scenes: ["shelf", "warehouse"] },
                say: "What the floor cannot cover goes to the store manager: a Remote Hub refill or a line on the next shipment.",
                link: { label: "Stock alerts", route: "stock_keeper.alerts.index" } },
            { key: "pack", title: "Pick & pack orders", who: ["stock_keeper"], action: "walk", stage: { type: "journey", current: "packing" },
                say: "Paid orders land on my list. I pick each line and pack it for the courier or the counter.",
                link: { label: "Orders", route: "stock_keeper.orders.index" } },
            { key: "send", title: "Send a transfer", who: ["stock_keeper", "delivery"], action: "point",
                stage: { type: "transfer", from: "Main Store · Remote Hub", to: "Main Store · Store floor", status: "pending", courier: true, quantity: 30, unit: "cartons" },
                say: "I hand the goods to the courier and the transfer goes on the road. The receiving keeper signs it in.",
                link: { label: "Transfers", route: "stock_keeper.transfers.index" } },
            { key: "count", title: "Know what is where", who: ["stock_keeper"], action: "talk", stage: { type: "scenes", scenes: ["hub", "warehouse", "store", "shelf"] },
                say: "Every unit has a place: a hub, a Remote Hub, the floor or a shelf. The inventory screen shows them all.",
                link: { label: "Inventory", route: "stock_keeper.inventory.index" } },
        ],
    },
    {
        key: "delivery",
        title: "Delivering",
        blurb: "Taking runs, carrying custody, proving delivery, and driving freight.",
        narrator: "delivery",
        steps: [
            { key: "runs", title: "See the runs on offer", who: ["delivery"], action: "point", stage: { type: "scenes", scenes: ["parcel", "truck"] },
                say: "Packed orders nobody has taken show up for every courier, or just for me when they were offered to me.",
                link: { label: "My dashboard", route: "delivery.dashboard" } },
            { key: "claim", title: "Take a run", who: ["delivery", "admin"], action: "talk", stage: { type: "journey", current: "to_deliver" },
                say: "I claim the run. An admin can also put a courier on one nobody has taken.",
                link: { label: "Deliveries", route: "delivery.delivery.index" } },
            { key: "collect", title: "Collect it: custody is mine", who: ["delivery", "stock_keeper"], action: "point",
                stage: { type: "transfer", from: "Main Store · Store floor", to: "Customer's home", status: "pending", courier: true, quantity: 1, unit: "order" },
                say: "The keeper hands me the parcel. From now until the door, the order is in my custody.",
                link: { label: "Deliveries", route: "delivery.delivery.index" } },
            { key: "road", title: "On the road", who: ["delivery"], action: "walk",
                stage: { type: "transfer", from: "Main Store · Store floor", to: "Customer's home", status: "in_transit", courier: true, quantity: 1, unit: "order" },
                say: "I drive it over. The customer and the store can see it is on its way.",
                link: { label: "Deliveries", route: "delivery.delivery.index" } },
            { key: "deliver", title: "Hand it over, or report a failure", who: ["delivery", "customer"], action: "wave",
                stage: { type: "transfer", from: "Main Store · Store floor", to: "Customer's home", status: "completed", courier: true, quantity: 1, unit: "order" },
                say: "I hand it over and mark it delivered. If nobody is there, I mark it failed and say why.",
                link: { label: "History", route: "delivery.history.index" } },
            { key: "freight", title: "Drive transfers and shipments", who: ["delivery"], action: "walk",
                stage: { type: "transfer", from: "Main Hub · Hub B", to: "Second Store · Remote Hub", status: "in_transit", courier: true, quantity: 80, unit: "cartons" },
                say: "I also carry stock between sites. For a shipment I first agree a time with both docks.",
                link: { label: "Shipments", route: "delivery.shipments.index" } },
        ],
    },
    {
        key: "admin",
        title: "Running the stores",
        blurb: "Choosing the store, the catalogue and prices, stock rules, money and people.",
        narrator: "admin",
        steps: [
            { key: "store", title: "Pick the store you are looking at", who: ["admin"], action: "point", stage: { type: "scenes", scenes: ["store", "store", "warehouse"] },
                say: "A global admin sees every store, or picks one in Settings. A store admin is fixed to their own store.",
                link: { label: "Settings", route: "admin.settings" } },
            { key: "dashboard", title: "See what needs attention", who: ["admin", "store_manager"], action: "talk", stage: { type: "journey", current: "paid" },
                say: "The dashboard shows every area live, and what is waiting on someone. Each card opens its list.",
                link: { label: "Dashboard", route: "admin.dashboard" } },
            { key: "catalogue", title: "Keep the catalogue", who: ["admin", "procurement"], action: "talk", stage: { type: "variants" },
                say: "Items and their variants live in one catalogue. A store sells an item once it is deployed there.",
                link: { label: "Items", route: "admin.items.index" } },
            { key: "prices", title: "Set prices", who: ["admin", "store_manager"], action: "point", stage: { type: "scenes", scenes: ["pay", "paid"] },
                say: "On the store page, tap an item, pick the variant and press Edit price: business, individual, per customer and per seller.",
                link: { label: "Store page", route: "store.show", needsStore: true } },
            { key: "capacity", title: "Set min levels, approve refills", who: ["store_manager", "admin"], action: "talk", stage: { type: "local", status: "pending" },
                say: "A min level per variant raises a refill when stock falls below it. I approve, lower or reject each one.",
                link: { label: "Capacity", route: "admin.inventory.capacity.index" } },
            { key: "money", title: "Payment accounts", who: ["admin", "finance"], action: "talk", stage: { type: "scenes", scenes: ["pay"] },
                say: "Each store has accounts customers pay into, each owned by the seller who confirms deposits.",
                link: { label: "Payment accounts", route: "admin.payment-accounts.index" } },
            { key: "people", title: "The people", who: ["admin"], action: "wave", stage: { type: "cast", roles: ["seller", "stock_keeper", "delivery", "store_manager", "finance"] },
                say: "Global admins create accounts, give roles, and put each person at a store.",
                link: { label: "Users", route: "admin.users.index" } },
        ],
    },
    {
        key: "moving",
        title: "Moving stock",
        blurb: "Hub to Remote Hub by shipment, Remote Hub to the floor by transfer, and floor to shelf inside the store.",
        narrator: "stock_keeper",
        steps: [
            { group: "Shipment: main hub → Remote Hub", key: "ship-build", title: "Build the manifest", who: ["admin", "store_manager"], action: "talk",
                stage: { type: "transfer", from: "Main Hub · Hub A", to: "Main Store · Remote Hub", status: "pending", courier: true, quantity: 120, unit: "cartons" },
                say: "A shipment is freight from a main hub. I list what goes on it and propose a time.",
                link: { label: "Shipments", route: "admin.inventory.shipments.index" } },
            { group: "Shipment: main hub → Remote Hub", key: "ship-agree", title: "Agree a time", who: ["stock_keeper", "delivery", "admin"], action: "talk",
                stage: { type: "transfer", from: "Main Hub · Hub A", to: "Main Store · Remote Hub", status: "pending", courier: true, quantity: 120, unit: "cartons" },
                say: "Both docks and the driver tick the same slot. Only then is the run scheduled.",
                link: { label: "Shipments", route: "stock_keeper.shipments.index" } },
            { group: "Shipment: main hub → Remote Hub", key: "ship-pick", title: "Pick, prepare, hand over", who: ["stock_keeper", "delivery"], action: "walk",
                stage: { type: "transfer", from: "Main Hub · Hub A", to: "Main Store · Remote Hub", status: "pending", courier: true, quantity: 120, unit: "cartons" },
                say: "At the hub we pick every line, check it, and sign it over to the driver.",
                link: { label: "Shipments", route: "stock_keeper.shipments.index" } },
            { group: "Shipment: main hub → Remote Hub", key: "ship-road", title: "On the road", who: ["delivery"], action: "walk",
                stage: { type: "transfer", from: "Main Hub · Hub A", to: "Main Store · Remote Hub", status: "in_transit", courier: true, quantity: 120, unit: "cartons" },
                say: "The driver carries it. Everyone can see where it is.",
                link: { label: "Driver's shipments", route: "delivery.shipments.index" } },
            { group: "Shipment: main hub → Remote Hub", key: "ship-receive", title: "Receive and sign", who: ["stock_keeper"], action: "point",
                stage: { type: "transfer", from: "Main Hub · Hub A", to: "Main Store · Remote Hub", status: "completed", courier: true, quantity: 120, unit: "cartons" },
                say: "The Remote Hub's keeper checks each line and signs. The stock is booked in.",
                link: { label: "Shipments", route: "stock_keeper.shipments.index" } },

            { group: "Transfer: Remote Hub → store floor", key: "tr-raise", title: "A refill is raised", who: ["store_manager", "stock_keeper"], action: "talk",
                stage: { type: "transfer", from: "Main Store · Remote Hub", to: "Main Store · Store floor", status: "pending", courier: true, quantity: 30, unit: "cartons" },
                say: "The floor runs low and the store manager puts the refill on the Remote Hub list. That is the approval.",
                link: { label: "Approvals", route: "admin.inventory.replenishment.index" } },
            { group: "Transfer: Remote Hub → store floor", key: "tr-hand", title: "Accepted and handed to a courier", who: ["stock_keeper", "delivery"], action: "point",
                stage: { type: "transfer", from: "Main Store · Remote Hub", to: "Main Store · Store floor", status: "pending", courier: true, quantity: 30, unit: "cartons" },
                say: "The Remote Hub accepts it and hands it to a courier: it leaves the site, so a courier carries it.",
                link: { label: "Transfers", route: "stock_keeper.transfers.index" } },
            { group: "Transfer: Remote Hub → store floor", key: "tr-road", title: "On the road", who: ["delivery"], action: "walk",
                stage: { type: "transfer", from: "Main Store · Remote Hub", to: "Main Store · Store floor", status: "in_transit", courier: true, quantity: 30, unit: "cartons" },
                say: "The courier drives it to the store.",
                link: { label: "Courier transfers", route: "delivery.transfers.index" } },
            { group: "Transfer: Remote Hub → store floor", key: "tr-in", title: "Received on the floor", who: ["stock_keeper"], action: "point",
                stage: { type: "transfer", from: "Main Store · Remote Hub", to: "Main Store · Store floor", status: "completed", courier: true, quantity: 30, unit: "cartons" },
                say: "The store's keeper signs it in. The floor is full again.",
                link: { label: "Transfers", route: "admin.inventory.transfers" } },

            { group: "Shelving: floor → shelf, inside the store", key: "sh-list", title: "On the shelving list", who: ["stock_keeper"], action: "talk", stage: { type: "local", status: "pending" },
                say: "A shelf below its refill line puts the item on my shelving list, straight away, with no approval.",
                link: { label: "Shelving list", route: "stock_keeper.shelving.index" } },
            { group: "Shelving: floor → shelf, inside the store", key: "sh-carry", title: "Carry it across", who: ["stock_keeper"], action: "walk", stage: { type: "local", status: "in_transit" },
                say: "It is a few steps, not a trip: I take it from the floor to the shelf myself.",
                link: { label: "Shelving list", route: "stock_keeper.shelving.index" } },
            { group: "Shelving: floor → shelf, inside the store", key: "sh-done", title: "On the shelf", who: ["stock_keeper"], action: "point", stage: { type: "local", status: "completed" },
                say: "Placed and counted. The shelf is back above its line.",
                link: { label: "Shelving list", route: "stock_keeper.shelving.index" } },
        ],
    },
];

/** The chapter each app opens on. */
export const DEFAULT_CHAPTER: Record<GuideApp, string> = {
    admin: "admin",
    seller: "seller",
    stock_keeper: "stock_keeper",
    delivery: "delivery",
};
