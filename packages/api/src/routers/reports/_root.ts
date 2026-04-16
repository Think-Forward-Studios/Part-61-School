import { router } from '../../trpc';
import { fleetUtilizationRouter } from './fleetUtilization';
import { instructorUtilizationRouter } from './instructorUtilization';
import { studentProgressRouter } from './studentProgress';
import { noShowRateRouter } from './noShowRate';
import { squawkTurnaroundRouter } from './squawkTurnaround';
import { courseCompletionRouter } from './courseCompletion';

export const reportsRouter = router({
  fleetUtilization: fleetUtilizationRouter,
  instructorUtilization: instructorUtilizationRouter,
  studentProgress: studentProgressRouter,
  noShowRate: noShowRateRouter,
  squawkTurnaround: squawkTurnaroundRouter,
  courseCompletion: courseCompletionRouter,
});
