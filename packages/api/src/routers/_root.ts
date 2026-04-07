import { router } from '../trpc';
import { authRouter } from './auth';
import { meRouter } from './me';

export const appRouter = router({
  auth: authRouter,
  me: meRouter,
});

export type AppRouter = typeof appRouter;
