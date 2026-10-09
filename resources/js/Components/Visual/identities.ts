/**
 * Who is who. Every role gets one identity used everywhere it appears (the
 * role switcher, the order journey, the "How Duka works" page): a colour from
 * the theme palette, an outfit, and the prop that says what they do.
 */

export type IdentityKey =
    | "admin"
    | "seller"
    | "stock_keeper"
    | "delivery"
    | "customer"
    | "finance"
    | "procurement"
    | "vendor"
    | "store_manager"
    | "marketing"
    | "dev"
    | "shared";

export type IdentityColor = "primary" | "secondary" | "success" | "warning" | "info" | "error";

export type Prop = "crown" | "apron" | "box" | "cap" | "bag" | "coin" | "clipboard" | "crate" | "key" | "megaphone" | "laptop" | "link";

export interface Identity {
    key: IdentityKey;
    label: string;
    /** One line: what this person does in the flow. */
    does: string;
    color: IdentityColor;
    prop: Prop;
    /** Skin and hair are fixed per identity so the cast reads as distinct people. */
    skin: string;
    hair: string;
}

export const IDENTITIES: Record<IdentityKey, Identity> = {
    admin: { key: "admin", label: "Admin", does: "Oversees every store, sets prices, people and stock rules", color: "primary", prop: "crown", skin: "#8d5524", hair: "#1b1b1b" },
    store_manager: { key: "store_manager", label: "Store manager", does: "Approves refills and runs one store's shelves", color: "secondary", prop: "key", skin: "#c68642", hair: "#2b1a0e" },
    seller: { key: "seller", label: "Seller", does: "Builds the cart with the customer and confirms the payment", color: "success", prop: "apron", skin: "#e0ac69", hair: "#3b2314" },
    customer: { key: "customer", label: "Customer", does: "Picks the goods, pays, and receives the order", color: "info", prop: "bag", skin: "#a0672f", hair: "#1b1b1b" },
    stock_keeper: { key: "stock_keeper", label: "Stock keeper", does: "Picks and packs orders, shelves stock, receives shipments", color: "warning", prop: "box", skin: "#6f4a2a", hair: "#121212" },
    delivery: { key: "delivery", label: "Delivery", does: "Carries orders to customers and transfers between sites", color: "error", prop: "cap", skin: "#b07a4b", hair: "#1e1208" },
    finance: { key: "finance", label: "Finance", does: "Keeps the books: payments, balances and remittances", color: "success", prop: "coin", skin: "#d7a26f", hair: "#4a2c14" },
    procurement: { key: "procurement", label: "Procurement", does: "Buys stock from vendors with purchase orders", color: "secondary", prop: "clipboard", skin: "#9b6a3c", hair: "#0f0f0f" },
    vendor: { key: "vendor", label: "Vendor", does: "Supplies goods to the warehouses", color: "warning", prop: "crate", skin: "#e8b98a", hair: "#5a3a1e" },
    marketing: { key: "marketing", label: "Marketing", does: "Tells customers what is new", color: "info", prop: "megaphone", skin: "#c99062", hair: "#26170b" },
    dev: { key: "dev", label: "Dev", does: "Builds and watches the system", color: "primary", prop: "laptop", skin: "#7d5233", hair: "#101010" },
    shared: { key: "shared", label: "Shared", does: "Pages shared across teams", color: "secondary", prop: "link", skin: "#b88457", hair: "#2a1a0c" },
};

export function identityFor(key: string | null | undefined): Identity {
    return IDENTITIES[(key ?? "") as IdentityKey] ?? IDENTITIES.customer;
}
