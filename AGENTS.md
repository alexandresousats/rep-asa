<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent

Postgres 16 is installed on the VM. Docker Compose in this repo is the laptop path; this environment has no Docker daemon. The API expects `DATABASE_URL=postgresql://asa:asa@127.0.0.1:5433/asa`. `policy-rc.d` blocks `service postgresql start`, so start the cluster with `sudo pg_ctlcluster 16 main start` after `port = 5433` is set in `/etc/postgresql/16/main/postgresql.conf`.

`npm run db:migrate` applies Prisma migrations. `npm run db:seed` creates the demo admin `alexandre@asa.app` / `asa123` when the database has no users.

The UI is `npm run dev -- --hostname 0.0.0.0 --port 3000`. The API is `npm run dev:api` on `127.0.0.1:4000`. Next.js rewrites `/api/*` to that API. Run `npx next typegen` before `npx tsc --noEmit`.
