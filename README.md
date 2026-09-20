# Velozity Projects: real-time client project dashboard

An internal tool for a small agency to manage client projects, track task progress and watch team activity as it happens.
Three roles (Admin, Project Manager, Developer), JWT auth with an HttpOnly refresh cookie, a role-filtered live activity feed over WebSockets, in-app notifications, and a scheduled overdue-task job.

| | |
|---|---|
| **Live app** | _add your Vercel URL here_ |
| **API** | _add your Render URL here_ |
| **Stack** | React 18 + TypeScript (Vite) · Node 22 + Express 4 + TypeScript · PostgreSQL 16 · Prisma · Socket.io (WebSocket only) · node-cron |

**Demo logins** (password for all: `Password123!`)

| Role | Email |
|---|---|
| Admin | `admin@velozity.dev` |
| Project manager | `priya@velozity.dev` (Storefront Redesign, Patient Portal) · `rohan@velozity.dev` (Fleet Tracker, Loyalty App) |
| Developer | `ravi@velozity.dev` · `meera@velozity.dev` · `karthik@velozity.dev` · `sana@velozity.dev` |

Best way to see it working: open two browser windows (one normal, one private), sign in as `ravi` in one and `priya` or `admin` in the other, then change a task's status as Ravi.

---

## Running it locally

### Option A: Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:5173>. The first boot applies the migration and seeds the database (`--if-empty`, so restarts never wipe your data).
Reset to fresh seed data: `docker compose down -v && docker compose up --build`.

### Option B: without Docker

Requires Node 20+ and a PostgreSQL 14+ database.

```bash
# 1. API
cd server
cp .env.example .env            # set DATABASE_URL and both JWT secrets
npm install                     # also runs `prisma generate`
npx prisma migrate deploy       # create the schema
npm run db:seed                 # demo data (wipes the DB first)
npm run dev                     # http://localhost:4000

# 2. Web app (second terminal)
cd client
cp .env.example .env
npm install
npm run dev                     # http://localhost:5173
```

In development the browser only talks to Vite; Vite proxies `/api` to the API (see `client/vite.config.ts`), so the refresh cookie behaves the same way it does in production. WebSockets connect straight to `VITE_SOCKET_URL`.

### Useful scripts (`server/`)

| Script | What it does |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run typecheck` / `npm run build` | TypeScript check / compile to `dist/` |
| `npm run db:seed` | Wipe and reseed (`-- --if-empty` to seed only an empty DB) |
| `npm run db:migrate` | `prisma migrate dev` (create/apply migrations while developing) |
| `npm run test:e2e` | End-to-end API + WebSocket checks (see [Testing](#testing)) |

### Environment variables

All secrets come from the environment. Nothing is hardcoded, and the server refuses to boot if a required variable is missing or a JWT secret is shorter than 32 characters.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | required |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Two different signing secrets | required |
| `ACCESS_TOKEN_TTL_SECONDS` | Access token lifetime | `900` |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime | `7` |
| `CLIENT_ORIGIN` | Allowed browser origin(s), comma separated (CORS + Socket.io) | `http://localhost:5173` |
| `COOKIE_SAMESITE` | `lax` \| `strict` \| `none` | `lax` |
| `OVERDUE_CRON` | Schedule of the overdue scanner | `*/5 * * * *` |
| `SEED_PASSWORD` | Password given to seeded accounts | `Password123!` |
| client: `VITE_SOCKET_URL` | Where the browser opens the WebSocket | `http://localhost:4000` |

---

## Architecture

```
client/  React + TS SPA
  api/client.ts            fetch wrapper: in-memory access token, single-flight refresh + replay on 401
  auth/                    session bootstrap from the refresh cookie
  realtime/SocketProvider  one socket per session; token renewal, reconnect, cache invalidation
  components/, pages/      UI (role-aware, but never the security boundary)

server/  Express + TS
  routes (HTTP + zod parsing)  ->  services (business rules, Prisma)  ->  Postgres
  src/modules/access/scope.ts  ONE place that defines who can see which projects / tasks / activity
  src/realtime/                Socket.io server, presence, and publisher (the only code that emits)
  src/jobs/overdue.job.ts      scheduled overdue scanner
  src/middleware/              authenticate, requireRole, central error handler
  prisma/                      schema, migration, seed
```

### Role-based access is enforced at the API, in two layers

1. **Route gate:** `authenticate` then `requireRole(...)` on every protected route (for example `POST /tasks` is `ADMIN | PROJECT_MANAGER` only, `/users` and `/clients` are not reachable by developers).
2. **Row scope:** every read and write of projects, tasks and activity goes through `access/scope.ts`, which turns the caller's role into a Prisma `where` clause:
   * Admin: everything
   * PM: `project.createdById = me`
   * Developer: `task.assigneeId = me`

   Out-of-scope rows behave exactly like missing ones (`404`), so ids can't be probed.

**"Modified token" attack:** access tokens are HS256-signed, so editing the payload breaks the signature and the request gets `401`. On top of that, `authenticate` ignores the role claim entirely and loads the user's role from the database on each request, so a stale role can never widen access and a deactivated user is locked out immediately. The e2e test forges a token with `role: ADMIN` and confirms it is rejected.

### Real-time activity feed

* **Transport:** Socket.io restricted to the `websocket` transport (no long-polling fallback on client or server).
* **Auth:** the handshake carries the access token; it goes through the same JWT + database check as REST. The socket is dropped when the token expires, and the client renews the token a minute early and tells the socket (`auth:refresh`), so healthy sessions never notice.
* **Delivery:** no shared "project rooms". A socket joins a private `user:<id>` room (admins also join `admins`). When a task changes, the server computes the audience (admins + the project's PM + the task's *current* assignee) and emits only to those rooms. A developer's socket is never sent an event about somebody else's task, so there is nothing to filter (or leak) in the browser. The REST feed uses the same rules via `scope.ts`, so live and catch-up views always agree.
* **Consistency:** the task update, the activity-log row(s) and any notifications are written in **one database transaction**; events are published only after it commits.
* **Format:** `Ravi moved Task #12 from In Progress → In Review · 2 mins ago` (relative times tick every 30 s).
* **Missed events:** when a user's *last* socket closes we store `User.lastSeenAt`. `GET /api/activity/missed` returns everything they're allowed to see that happened after that moment (latest 20 + total), read from Postgres, never from memory. The UI shows "You missed N updates since …", highlights them and lets the user mark them as seen.
* **Presence:** a `Map<userId, socketCount>` in memory (a user with three tabs counts once). Admins receive `presence:count` whenever it changes.
* **Notifications:** stored in the database; `notification:new` (with the fresh unread count) and `notification:count` are pushed to the user's private room, so the badge is real-time and also stays in sync across a user's tabs. There is no polling anywhere.

| Event (server → client) | Sent to | Payload |
|---|---|---|
| `activity:new` | admins, project PM, current assignee | activity entry |
| `task:changed` | same audience (+ the previous assignee gets `removed`) | `{ action: created\|updated\|removed, task }` |
| `notification:new` | the recipient | `{ notification, unreadCount }` |
| `notification:count` | the user (all their tabs) | `{ unreadCount }` |
| `presence:count` | admins | `{ online }` |

| Event (client → server) | Purpose |
|---|---|
| `auth:refresh` | hand the server the renewed access token |

### Decisions and why

| Decision | Choice | Why |
|---|---|---|
| **WebSocket library** | **Socket.io** (websocket transport only) | Rooms give me per-user targeting for free; automatic reconnection with a fresh token (`auth` callback), acks and a clean handshake-middleware hook for JWT auth. Native `ws` would mean hand-writing all of that, and the extra ~10 KB is irrelevant for an internal tool. |
| **Backend framework** | **Express 4** | Boring, everything is well understood, and the middleware model (`authenticate` → `requireRole` → handler) maps 1:1 to the requirement. Fastify is faster, but throughput is not this app's constraint, and Socket.io + Express share one `http.Server` with zero glue. |
| **Job runner** | **node-cron** | The job is one indexed `UPDATE` every few minutes. Bull adds Redis, a second process and more failure modes for no benefit at this size. The job is **idempotent** (only rows with `isOverdue = false` are touched, re-checked inside the transaction), so a duplicated or missed tick is harmless. It also runs once at boot to catch up after downtime. See limitations for multi-instance. |
| **Token storage** | Access token in **memory** only; refresh token in an **HttpOnly, SameSite=Lax, Secure (prod), `Path=/api/auth`** cookie | Nothing in `localStorage`, so XSS can't steal a long-lived credential; the cookie isn't attached to any other request. Refresh tokens are JWTs whose **sha256 hash** is stored in the DB, **rotate on every use**, and **reuse of an old one revokes all of that user's sessions**. Refresh/login/logout also require an `X-Requested-With` header (CSRF defence in depth). |
| **Cross-origin hosting** | Vercel **rewrites `/api/*` to the API** | The browser only ever talks to the Vercel origin for HTTP, so the cookie is first-party and works in Safari/Chrome without third-party cookie exceptions. Vercel cannot proxy WebSockets, so the socket connects straight to the API host, authenticated by token instead of cookie. |
| **ORM** | **Prisma** (Rust-free client + `pg` adapter) | Typed queries, migrations, and no raw SQL scattered through controllers. The only raw SQL is a `TRUNCATE` in the seed script. |
| **Validation** | **zod** on every route | Body, params and query are parsed server-side; failures return `400 VALIDATION_ERROR` with per-field details. |
| **Errors** | One central handler | Every error is `{ "error": { "code", "message", "details?" } }`. Unknown errors log the stack server-side and return a generic 500. Prisma errors map to 404/409. |
| **Overdue flag** | Column set by the scheduler | Not computed on page load. Each flagged task also gets a `TASK_OVERDUE` activity row and a live event. Marking a task Done or pushing the date out clears the flag immediately. |
| **Due dates** | Stored as end-of-day UTC | A date-only value means "by the end of that day". The UI shows it in UTC, so nobody sees a date shift. |

---

## Database

```mermaid
erDiagram
    USER ||--o{ REFRESH_TOKEN : has
    USER ||--o{ PROJECT : "creates / manages"
    CLIENT ||--o{ PROJECT : "owns"
    PROJECT ||--o{ TASK : contains
    USER ||--o{ TASK : "assigned to"
    USER ||--o{ TASK : "created by"
    TASK ||--o{ ACTIVITY_LOG : "history of"
    PROJECT ||--o{ ACTIVITY_LOG : "scopes"
    USER ||--o{ ACTIVITY_LOG : "acted by"
    USER ||--o{ NOTIFICATION : receives
    TASK ||--o{ NOTIFICATION : about

    USER { int id PK; string email UK; enum role; bool isActive; datetime lastSeenAt }
    REFRESH_TOKEN { int id PK; string tokenHash UK; int userId FK; datetime expiresAt; datetime revokedAt }
    CLIENT { int id PK; string name; string contactEmail }
    PROJECT { int id PK; string name; int clientId FK; int createdById FK }
    TASK { int id PK; int projectId FK; int assigneeId FK; enum status; enum priority; datetime dueDate; bool isOverdue }
    ACTIVITY_LOG { int id PK; enum type; int taskId FK; int projectId FK; int actorId FK; enum fromStatus; enum toStatus; datetime createdAt }
    NOTIFICATION { int id PK; int userId FK; enum type; string message; int taskId FK; datetime readAt }
```

The authoritative definition is [`server/prisma/schema.prisma`](server/prisma/schema.prisma) (migration: `server/prisma/migrations/0001_init`).

* **Foreign keys everywhere.** `Restrict` where deleting would silently destroy business data (client → project, user → project/task creator), `Cascade` for owned children (project → tasks → activity), `SetNull` where history should outlive the reference (assignee, actor, notification links).
* **`ActivityLog` is a real, append-only table**: status changes store who, when, from and to. Nothing is derived. `projectId` is deliberately denormalised onto it so PM and per-project feeds don't need to join through `Task`. `actorId = NULL` means the system (overdue scheduler).
* **"Task #12"** is simply `Task.id`.
* **Enum order is meaningful:** `Priority` is declared `LOW < MEDIUM < HIGH < CRITICAL`, so `ORDER BY priority DESC` sorts by urgency in Postgres without a `CASE` expression.

### Indexing decisions

Postgres does not index foreign keys automatically, so each index below exists for a specific query.

| Index | Serves |
|---|---|
| `User(email)` unique | login lookup |
| `User(role, isActive)` | active-developer list for the assignee picker; admin filters |
| `RefreshToken(tokenHash)` unique | refresh / logout lookup by hash |
| `RefreshToken(userId)` | revoke all sessions for a user |
| `Project(createdById)` | PM's "my projects" scope on every request |
| `Project(clientId)` | client → projects, delete guard |
| `Task(projectId, status)` | project board, per-project status counts (`GROUP BY`) |
| `Task(assigneeId, status)` | developer's task list and dashboard (the developer scope filter) |
| `Task(dueDate)` | due-date range filters and "due this week" |
| `Task(isOverdue, dueDate)` | overdue count and the scheduler's scan |
| `ActivityLog(createdAt DESC)` | admin's global feed and the "missed since" range scan |
| `ActivityLog(projectId, createdAt DESC)` | per-project feed and the PM-scoped feed |
| `ActivityLog(taskId, createdAt DESC)` | a task's history in the drawer; developer-scoped feed |
| `Notification(userId, createdAt DESC)` | the dropdown list |
| `Notification(userId, readAt)` | the unread badge count |

---

## API overview

All routes are under `/api`, JSON in and out. Protected routes need `Authorization: Bearer <access token>`.

| Route | Who | Notes |
|---|---|---|
| `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` | public / cookie | refresh cookie set/rotated/cleared here |
| `GET /users` | Admin (all), PM (active developers only) | |
| `POST /users`, `PATCH /users/:id` | Admin | role change / deactivate / password reset revokes sessions |
| `GET /clients` | Admin, PM | |
| `POST /clients`, `PATCH`/`DELETE /clients/:id` | Admin | delete blocked while projects exist |
| `GET /projects`, `GET /projects/:id` | all (scoped) | counts only include tasks you can see |
| `POST /projects`, `PATCH`/`DELETE /projects/:id` | Admin, PM (own) | |
| `GET /tasks` | all (scoped) | filters: `status`, `priority` (comma lists), `dueFrom`, `dueTo`, `overdue`, `projectId`, `assigneeId`, `q`, `sort`, `page`, `pageSize` |
| `GET /tasks/:id` | all (scoped) | includes its activity history |
| `POST /tasks`, `PATCH`/`DELETE /tasks/:id` | Admin, PM (own projects) | |
| `PATCH /tasks/:id/status` | anyone who can see the task | developers can only do this, only on their tasks |
| `GET /activity` · `/activity/missed` · `POST /activity/seen` | all (scoped) | cursor pagination with `before` |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | own only | |
| `GET /dashboard` | all | shape depends on the caller's role |

**Shareable filters.** Filters are query parameters end to end: the UI keeps them in the URL (`/tasks?status=IN_REVIEW,IN_PROGRESS&priority=HIGH,CRITICAL&dueFrom=2026-09-01&dueTo=2026-09-30`) and sends the same names to the API. "Copy link to this view" copies that URL.

---

## Testing

* `server/scripts/e2e.mjs`: 60 checks against a running API and real WebSockets: login/refresh rotation/reuse detection, forged tokens, every role boundary, scoped lists and feeds, filters, dashboards, live delivery to the right sockets (and no delivery to the wrong ones), notifications with live counts, reassignment, the scheduler flagging an overdue task and pushing it live, presence, and `lastSeenAt`.
  Run it against a freshly seeded database with a fast scheduler:
  ```bash
  cd server && npm run db:seed
  OVERDUE_CRON='*/3 * * * * *' npm run dev      # terminal 1
  npm run test:e2e                              # terminal 2
  ```
* The React app is type-checked (`npm run typecheck`) and was smoke-tested for admin, PM and developer flows in jsdom against the live API.

---

## Deploying (Vercel + a WebSocket-capable host)

Vercel's serverless functions cannot hold WebSocket connections or run cron jobs, so the API needs a long-running host. The submission's "live link" is the Vercel frontend.

1. **Database:** create a Postgres database (Neon / Supabase / Render). Use the connection string with `?sslmode=require`.
2. **API** on Render, Railway or Fly.io (root directory `server`):
   * Build: `npm ci && npm run build`
   * Start: `npm run start:prod` (runs `prisma migrate deploy`, seeds only if the database is empty, then starts the server)
   * Env: `NODE_ENV=production`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN=https://<your-app>.vercel.app`, `COOKIE_SAMESITE=lax`
3. **Web app** on Vercel (root directory `client`):
   * Put the API URL in `client/vercel.json` (`YOUR-BACKEND-HOST`) so `/api/*` is rewritten to it.
   * Env: `VITE_SOCKET_URL=https://<your-api-host>`
4. Open the Vercel URL, sign in with a demo account.

Free API tiers sleep when idle, so the first request after a break can take about 30 s. Open the app once before sharing the link.

---

## Known limitations

* **Single API instance.** Presence and socket rooms live in one process's memory. Running several instances needs the Socket.io Redis adapter (and a shared presence store). The overdue job is idempotent, so two instances running it concurrently is safe, only redundant; a proper multi-instance setup would move it to a queue (Bull/BullMQ) or take a Postgres advisory lock.
* **`lastSeenAt` is written on disconnect.** If the server crashes, a user's marker is stale and they may be shown a few extra "missed" events. Harmless, never missing ones.
* **Deleting a task deletes its history** (cascade). A production system might soft-delete instead.
* **Any developer can be assigned by any PM.** The brief doesn't define teams, so "their team's activity" is interpreted as activity in the PM's own projects.
* **No email/push notifications, comments, attachments or pagination inside the notification dropdown** (latest 20). Out of scope for this brief.
* **Refresh-token races.** Rotation with reuse detection is strict: if a response is lost on the network after the server rotated the token, the user has to sign in again. The client serialises refreshes across tabs (Web Locks) to avoid the common cause.
* **Rate limiting** covers login only.
* **Docker and the Vercel/Render deployment steps were written but not executed in my development sandbox** (no Docker or hosting access there). Everything else, including the API, WebSockets, scheduler, seed, migration SQL and the UI flows, was run against a real PostgreSQL 16.
