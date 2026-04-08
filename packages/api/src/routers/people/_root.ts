import { router } from '../../trpc';
import { holdsRouter } from './holds';
import { currenciesRouter } from './currencies';
import { qualificationsRouter } from './qualifications';
import { emergencyContactsRouter } from './emergencyContacts';
import { infoReleasesRouter } from './infoReleases';
import { experienceRouter } from './experience';

export const peopleRouter = router({
  holds: holdsRouter,
  currencies: currenciesRouter,
  qualifications: qualificationsRouter,
  emergencyContacts: emergencyContactsRouter,
  infoReleases: infoReleasesRouter,
  experience: experienceRouter,
});
