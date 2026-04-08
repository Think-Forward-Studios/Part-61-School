/**
 * Shared zod helpers for routers.
 *
 * `uuidString()` is a permissive-shape UUID check — zod v4's built-in
 * `.uuid()` enforces RFC 9562 version bits, which rejects the fixture
 * UUIDs used by the RLS test harness (e.g.
 * `11111111-1111-1111-1111-111111111111`). We still validate shape
 * (5 hex groups, 36 chars) so garbage strings don't reach Postgres.
 */
import { z } from 'zod';

export const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidString = () => z.string().regex(UUID_SHAPE, 'Invalid UUID');
