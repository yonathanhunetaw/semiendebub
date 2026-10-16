import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

const pages = ['/dashboard', '/guide', '/inventory', '/levels', '/floor', '/stock-alerts', '/orders', '/receiving', '/scan',
    '/shelving', '/shelving/permissions', '/shipments', '/stocktakes', '/transfers'];

pagesTest('stockkeeper', 'store keeper', fixture.keeper.email, pages);
pagesTest('stockkeeper', 'hub keeper', fixture.people.hubKeeper.email, pages);
