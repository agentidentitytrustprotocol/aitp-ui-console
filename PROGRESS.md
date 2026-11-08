# PROGRESS — console-final-check-wave7

Plan: `plans/console-final-check-wave7.md` (local, gitignored). Wave 7 FINAL CHECK of aitp-hardening.
Previous run's log: `plans/archive/console-rollout-wave4-PROGRESS.md` (local).

## Repo map (for this plan)
- `src/proxy.ts`: edge gate; public mode opens pages/api; matcher skips `_next/static` (L173).
- `src/lib/server/access.ts`: access decision; admin 403 L156-170; limits charged L189-191 (operators too); 429 body L66-79.
- `src/lib/server/limits.ts`: POLICIES read 300/60s, launch 5/600s, cpReadIp 60/60s; in-memory per instance.
- `src/lib/server/allowlist.ts`: route allowlist; `admin` entries; `/healthz` L89, cp `/api/health` L129.
- `src/app/login/route.ts`: POST /login JSON {password} → `__Host-aitp-console-session`.
- `src/components/scenarios/{scenario-detail,run-input-form}.tsx`: launch UI ("Run Scenario" → /runs/<id>).
- `src/components/runs/{run-summary,llm-quota-badge}.tsx`, `src/lib/llm-quota.ts`: quota badge.
- `deploy/doppler-sync.sh` (console → Vercel). Sibling read-only: `aitp-playground/deploy/doppler-sync.sh playground`,
  `aitp-playground/scripts/console_e2e.py` (oracle).
- Gates: `npm run lint && npm run typecheck && npm test && npm run build`; `npm run test:integration`.

## Phase log
- 2026-11-08 plan written.
- 2026-11-08 plan review: round 1 REVISE applied, round 2 REVISE detail fixes applied; sound.
- 2026-11-08 P1-P4 DONE (commit 59be962): live suite (security, read/launch limits, matrix, quota), quota-window.sh, check-vercel-main.sh, run-live.sh. Security smoke 6/6 PASS; quota hash verified 2bee7fda6781ed36 match.
- 2026-11-08 P5 docs DONE: TESTING.md § Live public-console suite; DECISIONS.md wave-7 entry; DEFERRED line (dead PATCH allowlist entry).
- 2026-11-08 local gates: lint, tsc, jest 2159/2159, integration 61 pass / 28 skip, build OK.
- 2026-11-08 ~19:00Z full live run started (`run-live.sh --quota-after 00:05`), evidence `e2e/live/.evidence/<stamp>`.
