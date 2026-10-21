import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

/**
 * Every admin page, for a global admin and for a store admin (who sees one store's data).
 * The global-only pages (catalogue, stores, users, system, warehouses) refuse a store admin;
 * access/roles.spec.ts pins that.
 */
const store = ['/dashboard', '/guide', '/settings', '/orders', '/carts', '/carts/create', '/deliveries',
    '/payments', '/payment-accounts', '/balances', '/credit', '/customers', '/customers/discounts',
    '/inventory', '/inventory/replenish', '/inventory/replenishment', '/inventory/transfers', '/inventory/transfers/create',
    '/inventory/locations', '/inventory/capacity', '/canvas', '/ideas', '/price-checks', '/shops'];
const globalOnly = ['/system', '/purchase-orders', '/supplier-payments', '/import-costs', '/stores', '/items', '/items/create', '/stores/create', '/users', '/users/create', '/sessions',
    '/inventory/shipments', '/inventory/stores', '/inventory/fleet', '/inventory/warehouse', '/inventory/warehouse/create',
    '/inventory/warehouse/locations/create'];

pagesTest('admin', 'global admin', fixture.people.admin.email, [...store, ...globalOnly]);
pagesTest('admin', 'store admin', fixture.people.storeAdmin.email, store);
