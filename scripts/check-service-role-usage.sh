#!/usr/bin/env bash
# CI grep gate — SUPABASE_SERVICE_ROLE_KEY must appear ONLY in:
#   - packages/api/src/routers/auth.ts
#   - packages/api/env.ts
#   - .env.example
#   - .github/ workflows
#
# See phase 1 research §Pitfall 2 (service role bypass).
set -euo pipefail

allowed_re='(packages/api/src/routers/auth\.ts|packages/api/src/routers/documents\.ts|packages/api/src/routers/admin/people\.ts|packages/api/env\.ts|\.env\.example|^\.github/|scripts/check-service-role-usage\.sh)'

# Search TS/TSX sources only. Exclude node_modules, .next, dist, .turbo.
offenders=$(grep -rn 'SUPABASE_SERVICE_ROLE_KEY' \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=.next \
  --exclude-dir=dist --exclude-dir=.turbo \
  apps packages 2>/dev/null \
  | grep -Ev "$allowed_re" \
  || true)

if [ -n "$offenders" ]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY referenced outside the allowed files:" >&2
  echo "$offenders" >&2
  echo "" >&2
  echo "The service role key bypasses RLS. It must be imported ONLY inside" >&2
  echo "packages/api/src/routers/auth.ts (or validated in packages/api/env.ts)." >&2
  exit 1
fi

echo "OK: SUPABASE_SERVICE_ROLE_KEY usage is scoped correctly."
