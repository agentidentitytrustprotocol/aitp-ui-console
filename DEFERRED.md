# Deferred

One line per item that did not meet the bar for a task (not a bug, blocker, security issue, design flaw or regression).
- 2026-11-08 console-lockdown-wave3: before turning public mode on, add a route-level test with the flag on (x-api-key, read-key choice, X-AITP-Client-IP, anonymous 403/allow) and the plan's throttled count-only log of console 429s (`access.ts` limiter, `src/proxy.ts` Basic limiter); align the 503 pre-check (`env.CP_READ_API_KEY`) with the planner's `serverConfig.cpReadApiKey`.
- 2026-11-08 repo-wide prettier pass (format:check fails on main, 151 files; CI does not run it).
