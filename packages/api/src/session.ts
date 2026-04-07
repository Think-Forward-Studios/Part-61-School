/**
 * Session — the resolved, JWT-verified caller identity the tRPC context
 * carries into every protected procedure.
 *
 * `activeRole` is resolved by the web layer before building the context:
 * it reads the `part61.active_role` cookie first, falls back to the
 * JWT's active_role claim (which itself is the user's is_default role),
 * and validates that the chosen role appears in the roles[] array.
 */
export type Role = 'student' | 'instructor' | 'mechanic' | 'admin';

export interface Session {
  userId: string;
  schoolId: string;
  email: string;
  roles: Role[];
  activeRole: Role;
}
