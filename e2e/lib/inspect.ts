import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Ledger facts the screens round off or hide, read straight from the duka_e2e database
 * through `php artisan e2e:inspect` (it refuses any other database). The specs run inside
 * ./deploy/dev.sh e2e, whose environment already points artisan at duka_e2e.
 */
const appRoot = fileURLToPath(new URL('../..', import.meta.url));

function inspect<T>(what: 'stock' | 'item' | 'sale' | 'transfer' | 'store', key: string | number): T {
    const out = execFileSync('php', ['artisan', 'e2e:inspect', what, String(key)], { cwd: appRoot, env: process.env, encoding: 'utf8' });
    // Debug logging may share stdout; the answer is the last JSON line.
    const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{') || l.startsWith('['));
    if (!line) throw new Error(`e2e:inspect ${what} ${key} printed no JSON:\n${out}`);

    return JSON.parse(line) as T;
}

/** Units of a variant per stock location id (only locations that hold or held it). */
export const stockOf = (variantId: number): Record<string, number> => inspect('stock', variantId);

/** Pieces of an item (every variant, a carton counted as its pieces), per stock location id. */
export const itemStockOf = (itemId: number): Record<string, number> => inspect('item', itemId);

/** Units of a variant at one location. */
export const unitsAt = (variantId: number, locationId: number): number => stockOf(variantId)[String(locationId)] ?? 0;

export interface SaleFacts {
    stage: 'awaiting_payment' | 'pick_pack' | 'to_deliver' | 'delivered' | 'cancelled' | string;
    total: number;
    payments: Array<{ method: string; amount: number; status: string }>;
    lines: Array<{ variant: number; quantity: number; price: number }>;
    holds: Array<{ variant: number; quantity: number; status: string; location: number | null }>;
}

export const saleOf = (reference: string): SaleFacts => inspect('sale', reference);

export interface TransferFacts {
    status: string;
    quantity: number;
    received: number | null;
    handed_over: boolean;
    source: number | null;
    destination: number | null;
    /** The "In Delivery" location: goods in a courier's hands. */
    transit: number;
}

export const transferOf = (reference: string): TransferFacts => inspect('transfer', reference);

/** A store by its name: its id, status and the kinds of stock location it has. */
export const storeNamed = (name: string): { id: number; status: string; locations: string[] } => inspect('store', name);
