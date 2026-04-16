import { router } from '../trpc';
import { authRouter } from './auth';
import { meRouter } from './me';
import { documentsRouter } from './documents';
import { adminRouter } from './admin/_root';
import { peopleRouter } from './people/_root';
import { flightLogRouter } from './flightLog';
import { registerRouter } from './register';
import { scheduleRouter } from './schedule';
import { dispatchRouter } from './dispatch';
import { fifRouter } from './fif';
import { gradeSheetRouter } from './gradeSheet';
import { recordRouter } from './record';
import { adsbRouter } from './adsb';
import { notificationsRouter } from './notifications';
import { messagingRouter } from './messaging';
import { broadcastsRouter } from './broadcasts';
import { costRouter } from './cost';
import { instructorMetricsRouter } from './instructorMetrics';

export const appRouter = router({
  auth: authRouter,
  me: meRouter,
  documents: documentsRouter,
  admin: adminRouter,
  people: peopleRouter,
  flightLog: flightLogRouter,
  register: registerRouter,
  schedule: scheduleRouter,
  dispatch: dispatchRouter,
  fif: fifRouter,
  gradeSheet: gradeSheetRouter,
  record: recordRouter,
  adsb: adsbRouter,
  notifications: notificationsRouter,
  messaging: messagingRouter,
  broadcasts: broadcastsRouter,
  cost: costRouter,
  instructorMetrics: instructorMetricsRouter,
});

export type AppRouter = typeof appRouter;
