// Shared enums and zod schemas, imported by both apps/api and apps/web.
// Populated incrementally as each vertical slice introduces new entities
// (see docs/MANAGEMENT.md). Slice 1: auth + organization. Slice 2: members/clients/projects.

import { z } from 'zod';

export const SHARED_PACKAGE_VERSION = '0.1.0';

export const ROLES = ['ADMIN', 'MANAGER', 'USER'] as const;
export type RoleName = (typeof ROLES)[number];

export const registerSchema = z.object({
  orgName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(80),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  initials: string;
  avatarColor: string;
}

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
}

export interface AuthSession {
  user: AuthUser;
  org: AuthOrg;
  role: RoleName;
  accessToken: string;
}

// --- Slice 2: Members, Clients, Projects ---

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type MembershipStatusName = (typeof MEMBERSHIP_STATUSES)[number];

export const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProjectStatusName = (typeof PROJECT_STATUSES)[number];

export const createMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  role: z.enum(ROLES),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: 'Provide at least one of role or status',
  });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export interface MemberSummary {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  role: RoleName;
  status: MembershipStatusName;
  createdAt: string;
}

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.notes !== undefined, {
    message: 'Provide at least one field to update',
  });
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export interface ClientSummary {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(2000).optional(),
  clientId: z.string().cuid().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    clientId: z.string().cuid().nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatusName;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Slice 3: Tasks ---

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatusName = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriorityName = (typeof TASK_PRIORITIES)[number];

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.coerce.date().optional(),
  projectId: z.string().cuid().optional(),
  assigneeIds: z.array(z.string().cuid()).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    projectId: z.string().cuid().nullable().optional(),
    assigneeIds: z.array(z.string().cuid()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export interface TaskAssigneeSummary {
  userId: string;
  name: string;
  initials: string;
  avatarColor: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusName;
  priority: TaskPriorityName;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  assignees: TaskAssigneeSummary[];
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// --- Slice 6: Subtasks + Dependencies ---

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  assigneeId: z.string().cuid().optional(),
});
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;

export const updateSubtaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    done: z.boolean().optional(),
    assigneeId: z.string().cuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;

export interface SubtaskSummary {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  assignee: TaskAssigneeSummary | null;
  createdAt: string;
  updatedAt: string;
}

export const createDependencySchema = z.object({
  dependsOnId: z.string().cuid(),
});
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;

export interface DependencySummary {
  id: string;
  dependsOnId: string;
  dependsOnTitle: string;
  dependsOnStatus: TaskStatusName;
}

// --- Slice 7: Comments, Attachments, Activity feed ---

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(4000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export interface CommentSummary {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarColor: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentSummary {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

export const TASK_ACTIVITY_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'ASSIGNEE_CHANGED',
  'DUE_DATE_CHANGED',
] as const;
export type TaskActivityTypeName = (typeof TASK_ACTIVITY_TYPES)[number];

export interface TaskActivitySummary {
  id: string;
  type: TaskActivityTypeName;
  message: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}

// --- Slice 8: Time tracking ---

const MAX_ENTRY_MINUTES = 1440;

export const createTimeEntrySchema = z.object({
  minutes: z.number().int().min(1, 'Must log at least 1 minute').max(MAX_ENTRY_MINUTES, 'A single entry cannot exceed 24 hours'),
  note: z.string().trim().max(500).optional(),
  date: z.coerce.date().optional(),
});
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

export const updateTimeEntrySchema = z
  .object({
    minutes: z.number().int().min(1).max(MAX_ENTRY_MINUTES).optional(),
    note: z.string().trim().max(500).nullable().optional(),
    date: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;

export interface TimeEntrySummary {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  minutes: number;
  note: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
}

// --- Slice 9: Notifications ---

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'NEW_COMMENT',
  'TASK_DUE_SOON',
  'REOPEN_REQUESTED',
  'REOPEN_APPROVED',
  'REOPEN_REJECTED',
  'BLOCKER_REPORTED',
  'BLOCKER_RESOLVED',
] as const;
export type NotificationTypeName = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationSummary {
  id: string;
  type: NotificationTypeName;
  message: string;
  read: boolean;
  taskId: string | null;
  taskTitle: string | null;
  createdAt: string;
}

export const updateNotificationSchema = z.object({
  read: z.boolean(),
});
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;

// --- Slice 10: Reopen approval workflow ---

export const REOPEN_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ReopenRequestStatusName = (typeof REOPEN_REQUEST_STATUSES)[number];

export const createReopenRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
});
export type CreateReopenRequestInput = z.infer<typeof createReopenRequestSchema>;

export const decideReopenRequestSchema = z.object({
  approve: z.boolean(),
  reviewNote: z.string().trim().max(1000).optional(),
});
export type DecideReopenRequestInput = z.infer<typeof decideReopenRequestSchema>;

export interface ReopenRequestSummary {
  id: string;
  taskId: string;
  reason: string;
  status: ReopenRequestStatusName;
  requestedById: string;
  requestedByName: string;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

// --- Slice 16: Blocker reports ---

export const BLOCKER_REPORT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type BlockerReportStatusName = (typeof BLOCKER_REPORT_STATUSES)[number];

export const createBlockerReportSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
});
export type CreateBlockerReportInput = z.infer<typeof createBlockerReportSchema>;

export const resolveBlockerReportSchema = z.object({
  resolutionNote: z.string().trim().max(1000).optional(),
});
export type ResolveBlockerReportInput = z.infer<typeof resolveBlockerReportSchema>;

export interface BlockerReportSummary {
  id: string;
  taskId: string;
  reason: string;
  status: BlockerReportStatusName;
  reportedById: string;
  reportedByName: string;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// --- Slice 11: Manager dashboard ---

export interface DashboardOverdueTask {
  id: string;
  title: string;
  dueDate: string;
  priority: TaskPriorityName;
  assigneeNames: string[];
}

export interface DashboardMemberWorkload {
  userId: string;
  name: string;
  openCount: number;
  overdueCount: number;
  doneCount: number;
}

export interface DashboardActivityItem {
  id: string;
  actorName: string;
  taskTitle: string;
  message: string;
  createdAt: string;
}

export interface DashboardSummary {
  statusCounts: Record<TaskStatusName, number>;
  priorityCounts: Record<TaskPriorityName, number>;
  overdueCount: number;
  overdueTasks: DashboardOverdueTask[];
  completedLast7Days: number;
  onTimeRate: number | null;
  memberWorkload: DashboardMemberWorkload[];
  recentActivity: DashboardActivityItem[];
}

// --- Slice 12: Reports ---

export const reportsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export interface ProductivityRow {
  userId: string;
  name: string;
  completedCount: number;
  onTimeRate: number | null;
  totalMinutes: number;
  avgMinutesPerTask: number | null;
}

export interface ProductivityReport {
  from: string | null;
  to: string | null;
  rows: ProductivityRow[];
}
