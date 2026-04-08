import { router } from '../../trpc';
import { adminPeopleRouter } from './people';
import { adminAircraftRouter } from './aircraft';
import { adminSchoolRouter } from './school';
import { adminDashboardRouter } from './dashboard';
import { adminRoomsRouter } from './rooms';

export const adminRouter = router({
  people: adminPeopleRouter,
  aircraft: adminAircraftRouter,
  school: adminSchoolRouter,
  dashboard: adminDashboardRouter,
  rooms: adminRoomsRouter,
});
