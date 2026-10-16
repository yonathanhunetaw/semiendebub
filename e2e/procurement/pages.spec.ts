import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

pagesTest('procurement', 'procurement', fixture.people.procurement.email, [
    '/dashboard',
    '/purchase-orders',
    '/purchase-orders/create',
    '/payables',
    '/suppliers',
    '/suppliers/create',
]);
