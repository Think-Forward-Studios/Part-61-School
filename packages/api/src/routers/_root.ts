import { router } from '../trpc';
import { authRouter } from './auth';
import { meRouter } from './me';
import { documentsRouter } from './documents';

export const appRouter = router({
  auth: authRouter,
  me: meRouter,
  documents: documentsRouter,
});

export type AppRouter = typeof appRouter;
