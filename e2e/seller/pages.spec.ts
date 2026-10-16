import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

const pages = ['/dashboard', '/guide', '/menu', '/settings', '/items', '/categories', '/customers', '/customers/create',
    '/carts', '/carts/create', '/orders', '/orders/confirmation', '/orders/pick-pack', '/payments/inbox', '/balance',
    '/refills', '/refills/permissions', '/shipments'];

pagesTest('seller', 'seller', fixture.seller.email, pages);
pagesTest('seller', 'store manager', fixture.manager.email, pages);
