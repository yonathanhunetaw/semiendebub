import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

pagesTest('marketing', 'marketing', fixture.people.marketing.email, ['/dashboard', '/campaigns', '/sessions']);
