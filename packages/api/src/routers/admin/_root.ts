import { router } from '../../trpc';
import { adminPeopleRouter } from './people';
import { adminAircraftRouter } from './aircraft';
import { adminSchoolRouter } from './school';
import { adminDashboardRouter } from './dashboard';
import { adminRoomsRouter } from './rooms';
import { adminSquawksRouter } from './squawks';
import { adminMaintenanceRouter } from './maintenance';
import { adminAdsRouter } from './ads';
import { adminComponentsRouter } from './components';
import { adminWorkOrdersRouter } from './workOrders';
import { adminPartsRouter } from './parts';
import { adminLogbookRouter } from './logbook';
import { adminMaintenanceTemplatesRouter } from './maintenanceTemplates';
import { adminOverrunsRouter } from './overruns';
import { adminCoursesRouter } from './courses';
import { adminEnrollmentsRouter } from './enrollments';
import { adminStageChecksRouter } from './stageChecks';
import { adminEndorsementsRouter } from './endorsements';
import { adminStudentCurrenciesRouter } from './studentCurrencies';
import { adminOverridesRouter } from './overrides';
import { adminAuditRouter } from './audit';
import { adminGeofenceRouter } from './geofence';
import { adminActiveSessionsRouter } from './activeSessions';
import { adminRatesRouter } from './rates';

export const adminRouter = router({
  people: adminPeopleRouter,
  aircraft: adminAircraftRouter,
  school: adminSchoolRouter,
  dashboard: adminDashboardRouter,
  rooms: adminRoomsRouter,
  squawks: adminSquawksRouter,
  maintenance: adminMaintenanceRouter,
  ads: adminAdsRouter,
  components: adminComponentsRouter,
  workOrders: adminWorkOrdersRouter,
  parts: adminPartsRouter,
  logbook: adminLogbookRouter,
  maintenanceTemplates: adminMaintenanceTemplatesRouter,
  overruns: adminOverrunsRouter,
  courses: adminCoursesRouter,
  enrollments: adminEnrollmentsRouter,
  stageChecks: adminStageChecksRouter,
  endorsements: adminEndorsementsRouter,
  studentCurrencies: adminStudentCurrenciesRouter,
  overrides: adminOverridesRouter,
  audit: adminAuditRouter,
  geofence: adminGeofenceRouter,
  activeSessions: adminActiveSessionsRouter,
  rates: adminRatesRouter,
});
