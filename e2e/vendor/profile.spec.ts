import { profileTest } from '../lib/profile';
import { fixture } from '../lib/support';

profileTest('vendor', 'vendor', fixture.people.vendor.email, '0999100012');
