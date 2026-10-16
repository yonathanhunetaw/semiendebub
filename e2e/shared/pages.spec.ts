import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

pagesTest('shared', 'shared', fixture.people.shared.email, ['/dashboard']);
