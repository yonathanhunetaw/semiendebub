import { execFileSync } from 'node:child_process';

/** Read-only questions to the dev database, for the walkthroughs (make walkthrough). */
export function devQuery(sql: string): string {
    return execFileSync('./deploy/dev.sh', ['mysql', '-N', '-e', sql], { encoding: 'utf8' }).trim();
}

/** What the ledger holds now of a variant at one location. */
export const unitsAt = (variant: number, location: number): number =>
    Number(devQuery(`SELECT COALESCE(SUM(quantity),0) FROM item_stocks WHERE item_variant_id=${Number(variant)} AND stock_location_id=${Number(location)}`));

/** A customer's id by their (unique) phone number. */
export const customerIdByPhone = (phone: string): number =>
    Number(devQuery(`SELECT id FROM customers WHERE phone_number='${phone.replace(/[^0-9+]/g, '')}' ORDER BY id DESC LIMIT 1`));
