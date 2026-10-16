import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

pagesTest('vendor', 'vendor', fixture.people.vendor.email, ['/dashboard', '/catalogue', '/orders', '/profile']);
