# Madre Pulse — Developer Guide

## Setup

Prerequisites: Node 20 (see `.nvmrc`), Docker + Docker Compose, npm 10+.

```bash
# 1. Copy env files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 2. Install dependencies (root, workspaces)
npm install

# 3. Start infra + apps
docker compose up --build

# 4. Run migrations (first time, and after every schema change)
npm run db:migrate

# 5. Open the app
# Web:    http://localhost:3000
# API:    http://localhost:4000/health
# MinIO:  http://localhost:9001 (console)
```

For local (non-Docker) development of a single app:

```bash
npm run dev:api   # NestJS, port 4000, requires postgres/redis running (docker compose up postgres redis minio)
npm run dev:web   # Next.js, port 3000
```

## Architecture Overview

- **Monorepo**: npm workspaces — `apps/api` (NestJS), `apps/web` (Next.js App Router), `packages/shared` (zod schemas/enums shared by both).
- **Database**: PostgreSQL via Prisma ORM. Schema at `apps/api/prisma/schema.prisma`, migrations in `apps/api/prisma/migrations/`.
- **Task detail page** (`apps/web/src/app/tasks/[id]/page.tsx`, Slice 6, extended in Slice 7): read-only task header, Subtasks, Dependencies, Attachments, and a merged Activity+Comments feed. Reachable by clicking a task title in List view (Board/Calendar cards aren't linked yet — clicking would conflict with `@dnd-kit`'s drag handling on Board, and Calendar cells are already dense). Deliberately doesn't expose subtask-progress or blocked-count badges on List/Board/Calendar — that would need a batched aggregate query (`groupBy`/filtered `_count`) across every task in a list response, which isn't justified until a slice actually needs it at-a-glance; today it's one click away on the detail page.
- **Comments, attachments, and time entries are open collaboration, not edit rights.** Unlike subtasks/dependencies (gated by `assertCanModifyTask` — ADMIN/MANAGER or the task's assignee/creator), any authenticated org member can comment, attach a file, or log time on any task, matching "Chat = task-level comments only" from the architecture decisions — the point is letting anyone weigh in, not just the people formally on the task. Modifying is narrower and per-resource-owner: a comment's own author, an attachment's own uploader, or a time entry's own logger — or ADMIN/MANAGER (moderation) — in all three cases.
- **Time is stored as `minutes: Int`, never a float.** `TimeEntriesService` takes whole minutes; the frontend's "Hours" input (decimal, e.g. `1.5`) is converted client-side via `Math.round(hours * 60)` before validation. Capped at 1440 (24h) per entry as a sanity check, not a real-world limit — there's no running timer in Phase 1 (see Phase 2: Auto time tracking), so entries are always logged after the fact.
- **Activity feed is auto-logged, not hand-written.** `TasksService.create`/`update` diff the incoming change against the existing row and write a `TaskActivity` row per changed field (status/priority/assignee/dueDate) inside the same transaction as the task write — see `buildChangeActivities`. Messages store the raw before/after values (e.g. `"changed status from TODO to IN_PROGRESS"`), not a denormalized actor name — the actor is resolved live via the `actor` relation on every read, so a later name change doesn't strand stale text in old activity rows.
- **`apiFetch` must not force JSON `Content-Type` on `FormData` bodies** (`apps/web/src/lib/api-client.ts`) — the browser needs to set its own `multipart/form-data; boundary=...` header for file uploads, which it only does if no `Content-Type` is set at all. This bit us once already in Slice 7; the fix is a single `!(init.body instanceof FormData)` check in `request()`.
- **Task views**: `apps/web/src/app/tasks/page.tsx` holds shared state (tasks/members/projects, filters, the create form) and a List/Board/Calendar view toggle — all three read from the same filtered `tasks` array. `task-board-view.tsx` is the Kanban board (`@dnd-kit/core`, pointer-based — chosen over native HTML5 drag-and-drop since it's far more reliable to automate/test and more consistent across browsers); dragging a card calls the same `onStatusChange` handler as the list view's inline status dropdown, so there's one code path to `PATCH /tasks/:id`, and a card is only draggable if the viewer can edit that task. `task-calendar-view.tsx` is the month grid; tasks with no `dueDate` are simply not shown there. **Date handling gotcha deliberately avoided**: due dates are calendar dates, not instants, so the grid never converts a task's ISO due-date string through a local-timezone `Date` — it compares the raw `YYYY-MM-DD` slice of the ISO string against grid-day keys built purely from the local `Date` constructor's own Y/M/D (no UTC conversion crosses the comparison). Verified in a Playwright run with `timezoneId: 'America/New_York'` (UTC-4) — a task due Aug 25 would land on Aug 24 in the grid if this were done naively via `new Date(iso).getDate()`.
- **Multi-tenancy**: every org-scoped table carries `orgId`. The request-scoped tenant context (`nestjs-cls`, populated by `JwtAuthGuard` with `userId`/`orgId`/`role`) landed in Slice 1. Slice 2 settled the enforcement mechanism: **explicit `orgId` filtering in every service method** (via `requireOrgId(cls)`, see `apps/api/src/common/tenant/require-org-id.ts`), not a Prisma Client Extension. This was a deliberate choice over the originally-planned auto-scoping middleware — explicit `where: { orgId }` on every query is easier to audit/grep for a security-critical concern like tenant isolation, and avoids the correctness pitfalls of blanket query-rewriting (nested writes, raw queries, and relation loads silently bypassing an extension). Every new org-scoped model/service must follow the same pattern: `findFirst({ where: { id, orgId } })` before any update/delete (returning 404, not 403, so cross-tenant probing can't distinguish "not found" from "not yours"), and `orgId` set explicitly in every `create`.
- **Auth**: bcrypt-hashed passwords, JWT access token (15m default) + rotating refresh token (random 320-bit token, sha256-hashed at rest, httpOnly+sameSite=lax cookie scoped to `/auth`, 30d default). Refresh rotation detects reuse of an already-rotated token (signals theft) and revokes the user's whole token family. See Slice 1 (`apps/api/src/auth/`).
- **Realtime** (`apps/api/src/realtime/realtime.gateway.ts`, Slice 9): a Socket.io gateway. The client connects with `auth: (cb) => cb({ token: getAccessToken() })` (see `apps/web/src/lib/notifications-context.tsx`) — a callback, not a static value, so a reconnect always picks up the latest access token rather than one captured at connect time. `handleConnection` verifies the JWT the same way the REST `JwtAuthGuard` does (same secret, same payload shape) and joins the socket to `user:{userId}` and `org:{orgId}` rooms; an invalid/missing token disconnects the socket immediately rather than leaving it half-authenticated. Only `user:{userId}` is used so far (personal notifications); the `org:{orgId}` room exists for a future feature that needs org-wide broadcast.
- **Background jobs** (Slice 9): BullMQ on Redis, via `@nestjs/bullmq`. `BullModule.forRootAsync` in `app.module.ts` parses `REDIS_URL` into `{ host, port, password }` (`config/redis-connection.ts`) since BullMQ's `connection` option doesn't accept a raw `redis://` URL string. Two queues: `email` (one job per notification, decouples SMTP round-trip time from the request that triggered it) and `due-soon` (a single repeatable job, `{ repeat: { every: 3600000 }, jobId: 'due-soon-scan' }` registered in `DueSoonModule.onModuleInit` — the fixed `jobId` is what stops every app restart from registering a duplicate schedule).
- **Manager dashboard** (`apps/api/src/dashboard/`, `apps/web/src/app/dashboard/page.tsx`, Slice 11): a single `GET /dashboard` aggregates status counts (`groupBy`), overdue count + a 10-item preview list, tasks completed in the last 7 days, an org-wide on-time rate, and per-active-member workload (open/overdue/done counts) — all computed server-side in one request rather than the frontend stitching together several list endpoints. Gated ADMIN/MANAGER on both ends: `RolesGuard` on the controller, and the page also checks `role` before firing the request (redundant with the guard by design — the point is not showing a 403 flash to a USER who lands on the URL directly). Charts are hand-rolled `<div>` bars with inline `width: %` styles (a stacked bar for status distribution, a bar per member for workload) — no charting library. That's a deliberate call, not an oversight: these are simple proportional bars, not the kind of interactive/animated chart that would justify a new dependency, and Phase 1 has otherwise avoided adding libraries unless the feature is genuinely hard to hand-roll (the one exception being `@dnd-kit` for Slice 4's drag-and-drop).
- **`Task.completedAt`** (Slice 11): added because "completed this week" and "on-time rate" can't be computed from `updatedAt` (which changes on *any* field edit, not just a DONE transition) or from string-matching `TaskActivity` messages (fragile). `TasksService.computeCompletedAt()` sets it on the TODO/IN_PROGRESS → DONE transition and clears it on the reverse; `ReopenRequestsService.decide()` also clears it on approval, since that path moves a task off DONE without going through `TasksService.update()`. Both call sites need to agree on this or the dashboard's numbers silently drift.
- **Reopen approval workflow** (`apps/api/src/reopen-requests/`, Slice 10): a `ReopenRequest` is a small state machine — `PENDING` → `APPROVED`/`REJECTED`, and once decided it's terminal (`decide()` 400s on a non-`PENDING` request; there's no re-deciding or un-approving). Requesting reuses `assertCanModifyTask` (same rights as editing the task) and is only valid when the task is `DONE`; only one `PENDING` request per task at a time (409 on a second). Deciding is `ADMIN`/`MANAGER`-only via `RolesGuard`, not an in-service check, matching every other admin-gated route in this codebase. Approval updates the task's status to `TODO` and the `ReopenRequest` row in the same `$transaction`, plus a `TaskActivity` row, so the task detail page's existing feed shows the reopen without any new UI plumbing. Both the request (notifies every `ADMIN`/`MANAGER` in the org, not just one) and the decision (notifies the requester) go through `NotificationsService.notify()` from Slice 9 — two new triggers on the same pipeline, no new delivery mechanism.
- **Notifications** (`apps/api/src/notifications/`, Slice 9): `NotificationsService.notify()` is the single entry point other services call — it writes the `Notification` row, pushes it over the socket, and enqueues the email job, so there's exactly one place that defines what "notify a user" means. Three triggers wired so far: `TasksService` on assignment (create or reassign, skipping self-assignment), `CommentsService` on a new comment (to the task's assignee and creator, excluding the commenter, deduped if they're the same person), and `DueSoonService.scan()` (tasks due within 24h, not `DONE`, with an assignee — skips a task+user pair that already got a `TASK_DUE_SOON` notification in the last 24h, so the hourly job doesn't spam on every run). Email is best-effort: `EmailService` checks whether `SMTP_HOST` is set and logs the message instead of sending when it isn't — the current dev `.env` ships with it empty on purpose, so **no real emails send out of the box**; set real SMTP_* values to change that.
- **File storage** (`apps/api/src/storage/storage.service.ts`, Slice 7): a thin wrapper over the AWS S3 SDK, pointed at MinIO in dev and real S3 in production — same code path either way, since MinIO implements the S3 API (`forcePathStyle: true` is required for MinIO compatibility). This replaced the originally-planned separate "local disk driver" — MinIO already fills that role in dev, so a second parallel backend would be pure duplication with no one actually running the app without Docker. **`StorageService` holds two S3 clients**, and mixing them up silently breaks downloads: `client` (env `S3_ENDPOINT`) does the real work — upload/delete/bucket-management — and in Docker Compose that's `http://minio:9000`, a hostname that only resolves inside the Docker network. `publicClient` (env `S3_PUBLIC_ENDPOINT`, always `http://localhost:9000` in dev) is used *only* to sign download URLs, because a presigned URL's signature is bound to the host it was signed for — sign it with the internal hostname and the browser gets a URL it can never resolve. Bucket is auto-created on `onModuleInit` if missing (`HeadBucket` then `CreateBucket`), so there's no manual MinIO console step for a fresh dev environment.

## API Reference

Grows per slice. Base URL: `http://localhost:4000`.

| Method | Path | Slice | Description |
|---|---|---|---|
| GET | `/health` | 0 | Liveness + DB connectivity check |
| POST | `/auth/register` | 1 | Create org + admin user in one transaction. Body: `{ orgName, name, email, password }`. Sets refresh cookie, returns `{ user, org, role, accessToken }` |
| POST | `/auth/login` | 1 | Body: `{ email, password }`. Same response shape as register |
| POST | `/auth/refresh` | 1 | Reads refresh cookie, rotates it, returns `{ accessToken }` |
| POST | `/auth/logout` | 1 | Revokes the refresh cookie's token, clears the cookie. 204 |
| GET | `/auth/me` | 1 | Requires `Authorization: Bearer <accessToken>`. Returns `{ user, org, role }` |
| GET | `/members` | 2 | List org members. Any authenticated role |
| POST | `/members` | 2 | ADMIN only. Body: `{ email, name, role }`. If the email belongs to an existing global user, adds a `Membership` to this org; otherwise creates the user with a random password and returns `{ member, temporaryPassword }` (shown once — no email delivery yet) |
| PATCH | `/members/:id` | 2 | ADMIN only. Body: `{ role?, status? }`. Blocked with 400 if it would leave the org with zero active admins |
| GET | `/clients` | 2 | List org clients. Any authenticated role |
| POST/PATCH/DELETE | `/clients[/:id]` | 2 | ADMIN or MANAGER |
| GET | `/projects` | 2 | List org projects (with client name). Any authenticated role |
| POST/PATCH | `/projects[/:id]` | 2 | ADMIN or MANAGER. `PATCH` sets `status: ARCHIVED`/`ACTIVE`; there's no hard delete |
| GET | `/tasks` | 3 | List org tasks (with project/assignee/creator names). Optional query filters: `status`, `priority`, `assigneeId`, `projectId`. Any authenticated role |
| GET | `/tasks/:id` | 3 | Any authenticated role |
| POST | `/tasks` | 3 | Any authenticated role. Body: `{ title, description?, status?, priority?, dueDate?, projectId?, assigneeId? }`. `projectId`/`assigneeId` are validated against the current org |
| PATCH | `/tasks/:id` | 3 | Any authenticated role, but USER can only edit a task they created or are assigned to (403 otherwise); ADMIN/MANAGER can edit any task |
| DELETE | `/tasks/:id` | 3 | ADMIN or MANAGER only |
| GET/POST | `/tasks/:taskId/subtasks` | 6 | List is any authenticated role; POST requires the same edit rights as the parent task (ADMIN/MANAGER, or the task's assignee/creator) |
| PATCH/DELETE | `/tasks/:taskId/subtasks/:id` | 6 | Same edit rights as the parent task. `PATCH` body: `{ title?, done? }` |
| GET/POST | `/tasks/:taskId/dependencies` | 6 | List is any authenticated role; POST body: `{ dependsOnId }`, same edit rights as the parent task. Rejects self-dependency, cross-org targets, duplicates (409), and anything that would create a cycle (400) |
| DELETE | `/tasks/:taskId/dependencies/:id` | 6 | Same edit rights as the parent task |
| GET | `/tasks/:id/activity` | 7 | Auto-logged task history (created, status/priority/assignee/due-date changes). Any authenticated role |
| GET/POST | `/tasks/:taskId/comments` | 7 | Any authenticated role can list or post |
| DELETE | `/tasks/:taskId/comments/:id` | 7 | The comment's own author, or ADMIN/MANAGER |
| GET | `/tasks/:taskId/attachments` | 7 | Any authenticated role |
| POST | `/tasks/:taskId/attachments` | 7 | `multipart/form-data`, field name `file`, 15MB cap. Any authenticated role |
| GET | `/tasks/:taskId/attachments/:id/download-url` | 7 | Returns `{ url }` — a short-lived (5 min) presigned S3/MinIO GET URL. Any authenticated role |
| DELETE | `/tasks/:taskId/attachments/:id` | 7 | The attachment's own uploader, or ADMIN/MANAGER |
| GET/POST | `/tasks/:taskId/time-entries` | 8 | Any authenticated role. POST body: `{ minutes, note?, date? }` — `date` defaults to today, `minutes` capped at 1440 |
| PATCH/DELETE | `/tasks/:taskId/time-entries/:id` | 8 | The entry's own logger, or ADMIN/MANAGER |
| GET | `/notifications` | 9 | Latest 50 for the current user, most recent first. Always scoped to `userId` — there's no ADMIN override, notifications are personal |
| PATCH | `/notifications/:id` | 9 | Body: `{ read: boolean }`. Own notifications only |
| POST | `/notifications/read-all` | 9 | Marks all of the current user's unread notifications read. 204 |
| GET/POST | `/tasks/:taskId/reopen-requests` | 10 | List is any authenticated role; POST requires the same edit rights as the task (ADMIN/MANAGER, or the task's assignee/creator), and only on a `DONE` task. 400 if not `DONE`, 409 if a `PENDING` request already exists |
| PATCH | `/tasks/:taskId/reopen-requests/:id` | 10 | ADMIN or MANAGER only. Body: `{ approve: boolean, reviewNote? }`. 400 if the request isn't `PENDING`. Approving sets the task's status back to `TODO` |
| GET | `/dashboard` | 11 | ADMIN or MANAGER only. Returns `DashboardSummary`: status counts, overdue count + preview list, tasks completed in the last 7 days, org-wide on-time rate, per-member workload |

Realtime: connect Socket.io to the API's base URL with `auth: { token: <accessToken> }`; the server emits a `notification` event (payload: `NotificationSummary`) to the connecting user whenever `NotificationsService.notify()` fires for them.

Access tokens go in the `Authorization: Bearer` header (not a cookie) so they're never sent automatically by the browser; only the refresh token is a cookie, and it's httpOnly + scoped to path `/auth`. The frontend keeps the access token in memory only (`apps/web/src/lib/api-client.ts`) and calls `/auth/refresh` on load and on any 401.

## Database Schema

Current models (through Slice 10):

- `Organization` — tenant root. `id, name, slug, createdAt`.
- `User` — global identity (not tied to a single org). `id, email, passwordHash, name, initials, avatarColor, createdAt, updatedAt`.
- `Membership` — join of User↔Organization, carries `role` (`ADMIN`/`MANAGER`/`USER`) and `status`. Unique on `(userId, orgId)`.
- `RefreshToken` — `id, userId, tokenHash (unique, sha256), expiresAt, revokedAt, replacedById, createdAt`. One row per issued refresh token; rotation on each `/auth/refresh` marks the old row revoked and links `replacedById` to the new one.
- `Client` — org-scoped tag/filter entity (no portal). `id, orgId, name, notes, createdAt, updatedAt`. Unique on `(orgId, name)`.
- `Project` — org-scoped, optionally tagged to a `Client` (`onDelete: SetNull`, so deleting a client never orphans a project). `id, orgId, clientId, name, description, status (ACTIVE/ARCHIVED), createdAt, updatedAt`. Unique on `(orgId, name)`.
- `Task` — org-scoped. `id, orgId, projectId, assigneeId, createdById, title, description, status (TODO/IN_PROGRESS/DONE), priority (LOW/MEDIUM/HIGH/URGENT), dueDate, completedAt, createdAt, updatedAt`. `projectId` and `assigneeId` are both optional and `onDelete: SetNull`; `createdById` is required and set from the JWT at creation (never client-supplied). `completedAt` (Slice 11) is auto-managed, not client-settable — see the dashboard architecture note.
- `Subtask` — belongs to one `Task` (`onDelete: Cascade`). `id, taskId, title, done, createdAt, updatedAt`. No org-scoping of its own; access is gated through the parent task.
- `TaskDependency` — a directed edge `taskId -> dependsOnId` meaning `taskId` is blocked by `dependsOnId` (both `onDelete: Cascade`). `id, taskId, dependsOnId, createdAt`. Unique on `(taskId, dependsOnId)`. See `DependenciesService.wouldCreateCycle` for the cycle check.
- `Comment` — belongs to one `Task` (`onDelete: Cascade`). `id, taskId, authorId, body, createdAt, updatedAt`.
- `Attachment` — belongs to one `Task` (`onDelete: Cascade`). `id, taskId, uploadedById, fileName, mimeType, sizeBytes, storageKey (unique), createdAt`. `storageKey` is `{orgId}/{taskId}/{random}-{sanitizedFileName}` in the bucket — the actual file bytes live in S3/MinIO, not the database.
- `TaskActivity` — belongs to one `Task` (`onDelete: Cascade`). `id, taskId, actorId, type (CREATED/STATUS_CHANGED/PRIORITY_CHANGED/ASSIGNEE_CHANGED/DUE_DATE_CHANGED), message, createdAt`. Auto-written by `TasksService`, never client-supplied.
- `TimeEntry` — belongs to one `Task` (`onDelete: Cascade`). `id, taskId, userId, minutes, note, date, createdAt, updatedAt`. `date` is the calendar day the work was done, independent of `createdAt` (when the entry was logged).
- `Notification` — org-scoped, always personal to one `User` (`onDelete: Cascade` on both `Organization` and `User`). `id, orgId, userId, taskId (nullable), type (TASK_ASSIGNED/NEW_COMMENT/TASK_DUE_SOON/REOPEN_REQUESTED/REOPEN_APPROVED/REOPEN_REJECTED), message, read, createdAt`. `taskId` is nullable and `onDelete: Cascade` — if the task is later deleted, its notifications go with it rather than pointing at nothing.
- `ReopenRequest` — belongs to one `Task` (`onDelete: Cascade`). `id, taskId, requestedById, reason, status (PENDING/APPROVED/REJECTED), reviewedById (nullable), reviewNote (nullable), createdAt, reviewedAt (nullable)`. `requestedBy` and `reviewedBy` are separate `User` relations (`ReopenRequester`/`ReopenReviewer`) since a request and its review are different people.

This is Phase 1's full target schema — every model named in the original plan now exists.

## Known limitations (tracked, not blocking)

- **`packages/shared` isn't watched.** It has a real build step now (`tsc` → `dist/`, required because NestJS's dev runtime executes plain compiled JS and can't load raw `.ts` via `require`). Docker bind-mounts the source over the image's build output, so after editing `packages/shared/src`, run `npm run build --workspace=packages/shared` on the host and restart the `api`/`web` containers to pick it up — it won't hot-reload automatically.
- **Multi-org membership has no UI.** The schema allows a `User` to hold multiple `Membership`s, but `/auth/login` just picks the oldest active one — there's no org switcher. Not needed until a slice introduces invites to multiple orgs.
- **JWT role claim can go stale.** A role change takes effect on next token refresh (≤15m), not instantly, since the access token embeds `role` at issuance.
- **`POST /members` still has no real invite email.** Slice 9 added email delivery infrastructure, but nothing wires a `POST /members` call to send one — the temporary password is still only returned once in the API response. Wiring that up is a small follow-up, not a new feature.
- **Projects have no hard delete.** `PATCH /projects/:id { status: 'ARCHIVED' }` is the only removal path, to avoid ever orphaning a Task once Slice 3 adds `Task.projectId`.
- **No real SMTP configured in dev.** `SMTP_HOST` ships empty in `apps/api/.env`; `EmailService` detects that and logs the would-be email instead of sending it. This is intentional (see the Notifications architecture note above), not a bug — set real SMTP_* env vars to get actual delivery.
- **Slices 9, 10, and 11 are unverified against a live stack.** Docker Desktop went down (disk full) partway through Slice 9, and Slices 10–11 were built the same way at the user's explicit direction to keep building rather than pause for it. All three are written in full — schema, backend, frontend — and `npm run lint`/`npm run build` pass clean on the host for every change (each slice's migration was re-verified against the Prisma Client after every schema edit, and reviewed once more by hand for logic that a type checker can't catch — e.g. transaction boundaries, notification fan-out), but none of the three migrations has been applied to a real database and nothing has been exercised end-to-end (no curl pass, no realtime/Playwright check). Flagged here rather than silently marked "Done" — treat all three as needing the standard verification pass (migrate, curl the new endpoints, click through the UI, and for Slice 9 specifically confirm the realtime push with two browser sessions) before trusting them.

## Testing

- Unit tests: `npm run test --workspace=apps/api` (Jest).
- E2E tests: `npm run test:e2e --workspace=apps/api` (Nest + supertest).
- No frontend automated tests required in Phase 1 (see plan's Verification section).

## Manual verification checklist (per slice)

1. `docker compose up --build`
2. Apply new Prisma migration on a fresh volume: `docker compose down -v && docker compose up --build`
3. Exercise new/changed endpoints via `docs/api-requests.http`
4. Click through the new UI in-browser
5. For realtime slices: confirm WS frames + a second session receives live updates
6. Cross-tenant check: second org/user sees zero visibility of the first org's data
7. `npm run lint && npm run build`
8. Relevant tests green
9. Docs updated (this file + MANAGEMENT.md + CLIENT.md)
