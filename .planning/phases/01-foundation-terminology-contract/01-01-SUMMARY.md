---
phase: 01-foundation-terminology-contract
plan: 01
subsystem: foundation
tags: [monorepo, tooling, eslint, ci, terminology-contract]
requires: []
provides:
  - pnpm + Turborepo monorepo skeleton (apps/web, packages/{db,api,domain,config})
  - Strict TypeScript baseline (@part61/config/tsconfig.base.json)
  - Custom ESLint rule part61/no-banned-terms with allow-comment support
  - Husky pre-commit + lint-staged
  - GitHub Actions CI (install -> typecheck -> lint -> test -> build)
affects: []
tech_stack:
  added:
    - next@15.5.14
    - react@19.2.4
    - react-dom@19.2.4
    - typescript@5.9.3
    - eslint@9.39.4
    - '@typescript-eslint/parser@^8.18.0'
    - '@typescript-eslint/eslint-plugin@^8.18.0'
    - eslint-plugin-react@^7.37.2
    - eslint-plugin-react-hooks@^5.1.0
    - turbo@2.9.4
    - husky@9.1.7
    - lint-staged@15.5.2
    - prettier@3.8.1
    - prettier-plugin-tailwindcss@0.6.14
  patterns:
    - Custom local ESLint rule consumed via in-config plugin object (no plugin package)
    - Subpath-exports config package (`@part61/config/{tsconfig.base.json,prettier,eslint,banned-terms}`)
    - Flat ESLint config (eslint.config.mjs) at repo root re-exports from @part61/config
key_files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - .nvmrc
    - .env.example
    - .gitignore
    - .prettierrc.js
    - eslint.config.mjs
    - CLAUDE.md
    - apps/web/package.json
    - apps/web/tsconfig.json
    - apps/web/next.config.ts
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - packages/config/package.json
    - packages/config/tsconfig.base.json
    - packages/config/prettier.config.js
    - packages/config/eslint.config.mjs
    - packages/config/banned-terms.json
    - packages/config/eslint-rules/no-banned-terms.js
    - packages/config/eslint-rules/no-banned-terms.test.js
    - packages/db/package.json
    - packages/db/tsconfig.json
    - packages/db/src/index.ts
    - packages/api/package.json
    - packages/api/tsconfig.json
    - packages/api/src/index.ts
    - packages/domain/package.json
    - packages/domain/tsconfig.json
    - packages/domain/src/index.ts
    - .husky/pre-commit
    - .lintstagedrc.json
    - .github/workflows/ci.yml
  modified: []
decisions:
  - Used eslint.config.mjs (not .js) so flat-config ESM imports work without setting "type":"module" on packages/config (which would break the CommonJS prettier.config.js and index.js)
  - Local ESLint rule shipped as a CommonJS file required directly by RuleTester from node:test - no plugin package, no build step
  - Allow-comment lookup walks from the offending node up to its containing statement so that `// allow-banned-term: <reason>` placed above `const x = 'Part 141'` correctly silences the rule (raw getCommentsBefore on a Literal returns nothing)
  - Banned-terms regex compiled once at module load with /gi flags and explicit lastIndex reset per check, to support case-insensitive word-boundary matching across multiple hits in one string
  - Phase-2 Supabase steps stubbed in ci.yml as an HTML comment block describing the exact insertion shape, so plan 02 can drop them in mechanically
metrics:
  duration_minutes: 6
  tasks_completed: 3
  files_created: 33
  completed_date: 2026-04-07
---

# Phase 01 Plan 01: Foundation Bootstrap Summary

One-liner: pnpm + Turborepo monorepo with strict TypeScript, a custom `part61/no-banned-terms` ESLint rule (with allow-comment escape hatch), Husky/lint-staged pre-commit, and a GitHub Actions CI pipeline (install -> typecheck -> lint -> test -> build) wired up on day one.

## What Shipped

### Task 1 — Monorepo skeleton (commit `a6dda65`)

- `pnpm-workspace.yaml` declares `apps/*` and `packages/*`.
- Root `package.json` pins pnpm@9.15.0 via packageManager and exposes `build/typecheck/lint/test/prepare` scripts that delegate to Turborepo 2.x.
- `turbo.json` (turbo 2 `tasks` key) defines `build`, `typecheck`, `lint`, `test`, and reserves `db:generate`/`db:migrate` for plan 02.
- `packages/config/tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `moduleResolution: bundler`, target ES2022, lib ES2022+DOM.
- Stub workspaces `@part61/db`, `@part61/api`, `@part61/domain` each export `{}` from `src/index.ts` and pass `tsc --noEmit`.
- `apps/web` is a minimal Next.js 15 / React 19 app rendering `<h1>Part 61 School</h1>` at `/`. `pnpm --filter web build` produces a static landing page; `grep -riE '(Part 141|approved|certified course)' apps/web/app` is empty.
- `CLAUDE.md` documents the stack and the soft-delete / audit / pooler / banned-term contracts.

### Task 2 — Custom no-banned-terms ESLint rule (commit `7513ba6`)

- `packages/config/banned-terms.json` contains exactly `["Part 141", "approved", "certified course"]`.
- `packages/config/eslint-rules/no-banned-terms.js` is a CommonJS rule that compiles a case-insensitive word-boundary regex from the JSON file at module load and visits `Literal`, `TemplateElement`, and `JSXText` nodes. Allow-comment lookup walks from the node up through its containing statement.
- `packages/config/eslint-rules/no-banned-terms.test.js` runs under `node:test` and ESLint's `RuleTester`. All 7 specified scenarios pass:
  1. `'Part 141 approved'` → 2 reports
  2. JSXText `This is a certified course` → 1 report
  3. Template `${school} approved program` → 1 report
  4. `// allow-banned-term: legacy header` above the literal → 0 reports
  5. `'PART 141'` → 1 report (case-insensitive)
  6. `'approval pending'` → 0 reports (word boundary)
  7. `// Part 141 is fine in a comment` → 0 reports (rule doesn't scan comments)
- `packages/config/eslint.config.mjs` (flat config) registers the rule under the local `part61` plugin and applies it at `error` severity to `apps/web/**/*.{ts,tsx,jsx}`, `apps/web/templates/**`, and `packages/exports/**`.
- Repo-root `eslint.config.mjs` re-exports the config so `pnpm --filter web lint` and any future workspace `eslint .` invocation resolve identically.
- Smoke-tested live: dropping `apps/web/app/_scratch.tsx` containing `export const x = 'Part 141';` made `pnpm --filter web lint` fail with the rule message; removing the file restored green.

### Task 3 — Husky + GitHub Actions CI (commit `e0ef104`)

- `.husky/pre-commit` executes `pnpm exec lint-staged` and is `chmod +x` (mode 100755 in git).
- `.lintstagedrc.json` runs `eslint --max-warnings=0` then `prettier --write` on staged TS/JS/JSX/TSX files, and `prettier --write` on staged JSON/MD/YAML.
- `.github/workflows/ci.yml` runs on push-to-main and PRs: checkout → pnpm/action-setup@v4 (v9) → setup-node@v4 (Node 20, pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm -r typecheck` → `pnpm -r lint` → `pnpm -r test` → `pnpm --filter web build`. A trailing HTML comment block documents the exact insertion shape for the plan-02 Supabase CLI / db:migrate / cross-tenant RLS test steps.
- Husky `prepare` script (root `package.json`) ensures the hook is installed automatically on `pnpm install`.

## Verification

Run from a clean clone:

```
pnpm install
pnpm -r typecheck   # passes (5 workspaces)
pnpm -r lint        # passes (eslint . in each workspace)
pnpm -r test        # passes (config pkg runs the 7 RuleTester cases; others are no-op)
pnpm --filter web build   # produces .next/ landing page
```

Each command was run locally during execution and produced exit 0.

## Final Workspace Scripts

Root `package.json`:

```
"build":     "turbo build"
"typecheck": "turbo typecheck"
"lint":      "turbo lint"
"test":      "turbo test"
"prepare":   "husky"
```

Per-workspace:

- `apps/web`: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (placeholder)
- `packages/db`, `packages/api`, `packages/domain`: `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (placeholder), `build` (placeholder)
- `packages/config`: `typecheck` (placeholder), `lint` (placeholder), `test` (`node --test eslint-rules/no-banned-terms.test.js`), `build` (placeholder)

## Final ESLint File Glob

The terminology-contract block in `packages/config/eslint.config.mjs`:

```
files: [
  'apps/web/**/*.{ts,tsx,jsx}',
  'apps/web/templates/**/*',
  'packages/exports/**/*',
],
plugins: { part61: { rules: { 'no-banned-terms': noBannedTerms } } },
rules: { 'part61/no-banned-terms': 'error' },
```

Global ignores: `**/node_modules/**`, `**/.next/**`, `**/dist/**`, `**/.turbo/**`, `**/*.test.*`, `**/*.spec.*`, `.planning/**`, `supabase/**`.

## banned-terms.json Contents

```
["Part 141", "approved", "certified course"]
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] allow-comment lookup needed to walk to the containing statement**

- **Found during:** Task 2 (TDD red phase passed; the "valid" allow-comment case failed initially).
- **Issue:** `sourceCode.getCommentsBefore(literal)` returns no comments when the literal is inside a `VariableDeclaration` — the comment is attached to the declaration, not the literal child.
- **Fix:** `hasAllowComment(node)` now also walks up `node.parent` to the nearest Statement/Declaration boundary and checks `getCommentsBefore` there.
- **Files modified:** `packages/config/eslint-rules/no-banned-terms.js`
- **Commit:** `7513ba6`

**2. [Rule 3 — Blocking] Renamed eslint config files to .mjs**

- **Found during:** Task 2.
- **Issue:** The flat ESLint config uses ESM `import` syntax. Loading `eslint.config.js` as ESM requires `"type": "module"` in `packages/config/package.json`, which would in turn break the CommonJS `prettier.config.js` and `index.js` in the same package.
- **Fix:** Renamed `packages/config/eslint.config.js` → `eslint.config.mjs` (and the root re-export `eslint.config.js` → `eslint.config.mjs`). Updated the `./eslint` subpath export accordingly.
- **Files modified:** `packages/config/package.json`
- **Commit:** `7513ba6`

### Out-of-scope artifacts encountered

During execution, untracked files belonging to plans 02+ (`packages/db/src/{client,tx,rls-test-registry}.ts`, `packages/db/src/schema/`, `packages/db/src/policies/`, `packages/db/drizzle.config.ts`) appeared twice in `packages/db/`. They are NOT plan 01-01's responsibility — plan 01-01 owns only the `src/index.ts` stub. They were removed and logged in `.planning/phases/01-foundation-terminology-contract/deferred-items.md`. Plan 01-02 (or wherever the Drizzle schema lands) will recreate them properly.

## Authentication Gates

None.

## Self-Check: PASSED

- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.env.example`, `.gitignore`, `.prettierrc.js`, `CLAUDE.md`: present
- `apps/web/{package.json,tsconfig.json,next.config.ts,app/layout.tsx,app/page.tsx}`: present
- `packages/config/{package.json,tsconfig.base.json,prettier.config.js,eslint.config.mjs,banned-terms.json,eslint-rules/no-banned-terms.js,eslint-rules/no-banned-terms.test.js}`: present
- `packages/{db,api,domain}/{package.json,tsconfig.json,src/index.ts}`: present
- `eslint.config.mjs` (root): present
- `.husky/pre-commit` (executable), `.lintstagedrc.json`, `.github/workflows/ci.yml`: present
- Commits `a6dda65`, `7513ba6`, `e0ef104`: all present in `git log`
