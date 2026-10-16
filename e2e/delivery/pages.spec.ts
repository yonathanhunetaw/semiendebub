import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

pagesTest('delivery', 'courier', fixture.courier.email, ['/dashboard', '/guide', '/delivery', '/history', '/shipments', '/transfers', '/profile', '/sessions']);
