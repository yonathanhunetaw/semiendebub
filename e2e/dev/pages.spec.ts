import { fixture } from '../lib/support';
import { pagesTest } from '../lib/pages';

// /architecture/download is a file, not a page. Lesson 4 renders a list without keys on
// purpose, next to the keyed one, to show React's warning.
pagesTest('dev', 'developer', fixture.people.dev.email,
    ['/dashboard', '/architecture', '/design-system', '/libraries', '/logs', '/sessions', '/shipments', '/lesson4', '/lesson6', '/lesson6/create', '/lesson7'],
    [/^\/lesson4: console Each child in a list should have a unique "key"/]);
