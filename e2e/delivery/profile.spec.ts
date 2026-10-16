import { profileTest } from '../lib/profile';
import { fixture } from '../lib/support';

profileTest('delivery', 'courier', fixture.courier.email, '0999100003');
