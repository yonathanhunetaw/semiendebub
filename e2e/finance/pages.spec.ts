import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

pagesTest('finance', 'finance', fixture.people.finance.email, ['/dashboard', '/reports', '/sessions', '/supplier-payments']);
