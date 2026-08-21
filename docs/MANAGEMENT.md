# Madre Pulse — Phase 1 Progress Tracker

Status legend: `Pending` · `In Progress` · `Done`

## Phase 1 (MVP) Feature Checklist

| # | Slice | Feature | Status | Notes |
|---|---|---|---|---|
| 0 | Scaffold & infra | Monorepo, Docker Compose, empty apps booting, health check | Done | Postgres/Redis/MinIO/api/web all wired; `/health` returns DB connectivity |
| 1 | Auth + Organization | Register (org+admin), login, JWT+refresh, RBAC guards, tenant context | Done | Bcrypt + rotating refresh tokens (httpOnly cookie), RBAC guard/decorator, CLS tenant context. Prisma Client Extension for auto org-scoping deferred to Slice 2 (see DEVELOPER.md) |
| 2 | Setup | Members management, Clients (tag entity), Projects | Done | Admin adds members directly (temp password shown once, no email delivery yet). Explicit `orgId`-scoped queries used throughout (see DEVELOPER.md tenant-scoping note) |
| 3 | Tasks core | Task CRUD, priorities/due dates, List view | Done | Assignment + project linking included. Ownership-based edit rights for USER role (assignee/creator only); ADMIN/MANAGER can edit/delete any task |
| 4 | Kanban view | Drag-and-drop board by status | Done | Frontend-only — reuses Slice 3's `PATCH /tasks/:id`. List/Board toggle on the same `/tasks` page (Calendar in Slice 5 will likely join as a third tab). Uses `@dnd-kit/core`; cards for tasks the user can't edit render non-draggable |
| 5 | Calendar view | Month grid by due date | Done | Frontend-only, third tab on `/tasks` alongside List/Board. Tasks with no due date don't appear here (by design — List/Board still show them) |
| 6 | Subtasks + Dependencies | Subtask progress, dependency links with cycle prevention | Done | New task detail page (`/tasks/:id`) hosts both. Cycle check is a BFS over existing dependency edges before insert, org-scoped and tenant-isolated |
| 7 | Comments + Attachments | Activity feed, file uploads | Done | S3-compatible storage (MinIO in dev) via a dual-endpoint client — internal endpoint for server-side ops, a separate public endpoint baked into presigned download URLs so the browser can actually reach them. Activity auto-logged on task create/status/priority/assignee/due-date changes; merged with comments into one chronological feed on the task detail page |
| 8 | Time tracking | Manual time entries per task | Done | Stored as `minutes` (Int) to dodge float rounding; frontend converts a decimal "Hours" input. Open collaboration like comments/attachments (anyone can log time on any task), and same moderation model — entry's own author or ADMIN/MANAGER can edit/delete |
| 9 | Notifications | In-app + email, realtime push | In Progress | Code complete (schema, backend, frontend) and lint/build clean, but **not yet runtime-verified** — Docker Desktop went down (disk full again) mid-slice, and we're deferring live verification until a full pass after all Phase 1 slices are built, per explicit direction. Triggers: task assigned, new comment (to assignee+creator, excl. commenter), task due within 24h (hourly BullMQ repeatable job). Delivery: DB row + Socket.io realtime push + queued email (SMTP-optional — logs instead of sending when unconfigured, which is the current dev default) |
| 10 | Reopen approval workflow | Full request → approve/reject state machine | In Progress | Code complete, lint/build clean, **not yet runtime-verified** — same Docker-down deferral as Slice 9. One request per task at a time (409 if a PENDING one exists); requestable by ADMIN/MANAGER or the task's assignee/creator, only on a DONE task; decidable by ADMIN/MANAGER only; approval flips status to TODO and logs a TaskActivity; both request and decision notify via the Slice 9 notification pipeline |
| 11 | Manager dashboard | Metrics + charts | In Progress | Code complete, lint/build clean, **not yet runtime-verified** (same Docker-down deferral). Added `Task.completedAt` (auto-set on DONE transitions) since the dashboard's "completed this week" and "on-time rate" metrics can't be computed without it — also sets up Slice 12's reports. Charts are hand-rolled CSS bars (stacked status bar, per-member workload bars), not a charting library — ADMIN/MANAGER only, both server- and client-gated |
| 12 | Reports | Productivity table, CSV/PDF export | Pending | |
| 13 | Hardening | Responsive polish, RBAC/tenant audit, prod Docker, AWS notes | Pending | |

## Phase 2 (explicitly deferred, not in Phase 1 scope)

- Auto time tracking
- Recurring tasks + reusable templates
- Slack / GitHub / Google Calendar integrations
- Dashboard customization
- Task reopen workflow refinements beyond Phase 1's approval flow

## Phase 3 (explicitly deferred, not in Phase 1 scope)

- Email-to-task automation
- SSO (Google/Microsoft)
- Billing/subscriptions (multi-tenant monetization)

## Architecture decisions on record

- Stack: TypeScript, Next.js + NestJS, PostgreSQL (Prisma), Redis/BullMQ, Socket.io
- Hosting: AWS (ECS Fargate, RDS, ElastiCache, S3, ALB), Docker for local + prod
- Multi-tenant SaaS, no billing in Phase 1
- Client = internal tag/filter only, no external client portal
- Chat = task-level comments only, no standalone chat module
- Build order = vertical full-stack slices (DB → API → UI per feature)
