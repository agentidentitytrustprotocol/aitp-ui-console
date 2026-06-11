# Internal docs (contributor-only)

These docs are **not published** to the public docs site. The website's
content sync only pulls the repo's top-level `docs/` folder, so anything
here stays in the repository for people working *on* the console.

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — prerequisites, first-time setup,
  the day-to-day three-terminal loop, quality gates, and the end-to-end
  "add a new route" recipe.
- [`TESTING.md`](./TESTING.md) — the unit and integration test suites,
  their env gates, what each covers, and a suggested CI strategy.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — deploying the console to Vercel
  (env vars, SSE plan sizing, runtime/routing notes) and the CI pipeline.

User-facing docs that **do** publish (to
<https://agentidentitytrustprotocol.io/console>) live in
[`../docs`](../docs): `FEATURES.md`, `ARCHITECTURE.md`, `PROXIES.md`,
`CONVENTIONS.md`.
