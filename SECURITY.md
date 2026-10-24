# Security

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/agentidentitytrustprotocol/aitp-ui-console/security/advisories/new),
not in a public issue.

## Access model

The console is a single-operator tool. It holds the control-plane and
playground API keys server-side and adds them to upstream requests, so
access to the console is access to those services.

- Every route except `/login` requires the operator session cookie or
  HTTP Basic with `CONSOLE_PASSWORD` (`src/proxy.ts`).
- If `CONSOLE_PASSWORD` or `CONSOLE_SESSION_SECRET` is unset, the console
  fails closed with 503 on every route.
- Mutating requests must carry an `Origin` that matches the console's own
  origin (or `TRUSTED_ORIGINS`).
- Login attempts are rate-limited per IP. The limiter is in memory and per
  instance.

Treat `CONSOLE_PASSWORD` and `CONSOLE_SESSION_SECRET` like the upstream API
keys: keep them out of the repo and rotate them if they may have leaked.
Rotating `CONSOLE_SESSION_SECRET` ends every session.
