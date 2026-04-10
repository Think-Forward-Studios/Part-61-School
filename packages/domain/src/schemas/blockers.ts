/**
 * Blocker payload schemas for Phase 6 lesson eligibility checks.
 *
 * The discriminated union maps 1:1 to the jsonb[] returned by
 * evaluate_lesson_eligibility(). The tRPC layer parses the raw DB
 * output through these schemas so the UI gets typed blocker payloads.
 */
import { z } from 'zod';

export const BlockerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('prerequisites'),
    detail: z.object({ missing_lessons: z.array(z.string().uuid()) }),
  }),
  z.object({
    kind: z.literal('student_qualifications'),
    detail: z.object({
      missing_currencies: z.array(z.string()),
      missing_qualifications: z.array(z.string()),
    }),
  }),
  z.object({
    kind: z.literal('instructor_qualifications'),
    detail: z.object({
      missing_currencies: z.array(z.string()),
      missing_qualifications: z.array(z.string()),
    }),
  }),
  z.object({
    kind: z.literal('resource'),
    detail: z.object({
      missing_tags: z.array(z.string()),
      missing_type: z.string().nullable(),
      missing_sim_kind: z.string().nullable(),
    }),
  }),
  z.object({
    kind: z.literal('repeat_limit'),
    detail: z.object({ current_count: z.number(), max: z.number() }),
  }),
]);

export type Blocker = z.infer<typeof BlockerSchema>;

export const EligibilityResultSchema = z.object({
  ok: z.boolean(),
  blockers: z.array(BlockerSchema),
  override_active: z.boolean().optional(),
});

export type EligibilityResult = z.infer<typeof EligibilityResultSchema>;
