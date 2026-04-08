import { router } from '../trpc';
import { authRouter } from './auth';
import { meRouter } from './me';
import { documentsRouter } from './documents';
import { adminRouter } from './admin/_root';
import { peopleRouter } from './people/_root';
import { flightLogRouter } from './flightLog';
import { registerRouter } from './register';

export const appRouter = router({
  auth: authRouter,
  me: meRouter,
  documents: documentsRouter,
  admin: adminRouter,
  people: peopleRouter,
  flightLog: flightLogRouter,
  register: registerRouter,
});

export type AppRouter = typeof appRouter;
