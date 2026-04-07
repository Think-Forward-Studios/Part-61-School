/**
 * me router — returns the resolved session for the current caller.
 * Used by the web layer to populate the header and render the
 * role-switcher dropdown.
 */
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) => {
    return ctx.session!;
  }),
});
