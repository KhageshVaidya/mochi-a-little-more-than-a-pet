import { exposeBridge } from './bridge';

// The companion gets its own, much smaller surface: pet movement, prefs and focusing the dashboard.
exposeBridge('companion', 'orbitalPet');
