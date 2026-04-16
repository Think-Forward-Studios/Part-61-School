/**
 * Report scope helpers — REP-05, MUL-03.
 *
 * Resolves base filter + date boundaries for all 6 standard reports.
 */
import { TRPCError } from '@trpc/server';

interface CallerContext {
  activeRole: string;
  activeBaseId?: string | null;
}

export function resolveReportScope({
  baseId,
  caller,
}: {
  baseId?: string;
  caller: CallerContext;
}): { baseIdsFilter: string[] | null; isRollup: boolean } {
  if (baseId === 'all') {
    if (caller.activeRole !== 'admin') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only admins can view reports across bases',
      });
    }
    return { baseIdsFilter: null, isRollup: true };
  }
  if (baseId) return { baseIdsFilter: [baseId], isRollup: false };
  if (caller.activeBaseId) return { baseIdsFilter: [caller.activeBaseId], isRollup: false };
  // No base context — show all (admin implicit rollup)
  return { baseIdsFilter: null, isRollup: caller.activeRole === 'admin' };
}

export function resolveDateBoundaries({
  from,
  to,
}: {
  from: string;
  to: string;
  timezone?: string;
}): { fromUtc: Date; toUtc: Date } {
  // Validate ISO date format YYYY-MM-DD
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Date params must be YYYY-MM-DD format',
    });
  }
  const fromUtc = new Date(from + 'T00:00:00Z');
  const toUtc = new Date(to + 'T23:59:59.999Z');
  if (isNaN(fromUtc.getTime()) || isNaN(toUtc.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid date' });
  }
  return { fromUtc, toUtc };
}
