/**
 * schedule root router — composes reservations, recurring, blocks,
 * freebusy sub-routers into a single namespace mounted at
 * appRouter.schedule.
 */
import { router } from '../trpc';
import { scheduleReservationsRouter } from './schedule/reservations';
import { scheduleRecurringRouter } from './schedule/recurring';
import { scheduleBlocksRouter } from './schedule/blocks';
import { scheduleFreeBusyRouter } from './schedule/freebusy';

export const scheduleRouter = router({
  request: scheduleReservationsRouter.request,
  approve: scheduleReservationsRouter.approve,
  list: scheduleReservationsRouter.list,
  update: scheduleReservationsRouter.update,
  cancel: scheduleReservationsRouter.cancel,
  markNoShow: scheduleReservationsRouter.markNoShow,
  getById: scheduleReservationsRouter.getById,
  checkStudentCurrency: scheduleReservationsRouter.checkStudentCurrency,
  recurring: scheduleRecurringRouter,
  blocks: scheduleBlocksRouter,
  freebusy: scheduleFreeBusyRouter,
});
