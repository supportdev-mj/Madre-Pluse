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
  isSuperAdmin: boolean;
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(72),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// --- Slice 2: Members, Clients, Projects ---

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type MembershipStatusName = (typeof MEMBERSHIP_STATUSES)[number];

export const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProjectStatusName = (typeof PROJECT_STATUSES)[number];

export const createMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  designation: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
    designation: z.string().trim().max(120).nullable().optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(MEMBERSHIP_STATUSES).optional(),
    managerId: z.string().cuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export interface MemberSummary {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  designation: string | null;
  initials: string;
  avatarColor: string;
  role: RoleName;
  managerId: string | null;
  managerName: string | null;
  status: MembershipStatusName;
  createdAt: string;
}

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  website: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  poc: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    website: z.string().trim().max(200).nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    poc: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export interface ClientSummary {
  id: string;
  name: string;
  website: string | null;
  location: string | null;
  poc: string | null;
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

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'TO_VERIFY', 'FAILED', 'DONE'] as const;
export type TaskStatusName = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriorityName = (typeof TASK_PRIORITIES)[number];

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(5000),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.coerce.date(),
  projectId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  assigneeIds: z.array(z.string().cuid()).min(1, 'At least one assignee is required'),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    description: z.string().trim().min(1, 'Description is required').max(5000).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    projectId: z.string().cuid().nullable().optional(),
    clientId: z.string().cuid().nullable().optional(),
    assigneeIds: z.array(z.string().cuid()).min(1, 'At least one assignee is required').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Verification: an assignee sends a task from IN_PROGRESS to TO_VERIFY; only ADMIN or the
// assignee's immediate manager may then decide it — APPROVE (-> DONE), SEND_BACK (-> IN_PROGRESS,
// more work needed but not a failure), or REJECT (-> FAILED, the assignee must rework and resubmit).
// A direct PATCH .../tasks/:id can never set status DONE or FAILED — those only ever happen through this.
export const VERIFICATION_DECISIONS = ['APPROVE', 'SEND_BACK', 'REJECT'] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

export const decideVerificationSchema = z.object({
  decision: z.enum(VERIFICATION_DECISIONS),
  reviewNote: z.string().trim().max(1000).optional(),
});
export type DecideVerificationInput = z.infer<typeof decideVerificationSchema>;

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const ASSIGNMENT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type AssignmentStatusName = (typeof ASSIGNMENT_STATUSES)[number];

/** Just a person reference (name/initials/avatar) — used anywhere a user is shown but isn't a
 * task-tracking participant, e.g. a subtask's owner or a comment's author. */
export interface PersonSummary {
  userId: string;
  name: string;
  initials: string;
  avatarColor: string;
}

export interface TaskAssigneeSummary extends PersonSummary {
  personalStatus: AssignmentStatusName;
  activeStartedAt: string | null;
  completedAt: string | null;
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
  clientId: string | null;
  clientName: string | null;
  assignees: TaskAssigneeSummary[];
  /** True if the current user may approve/send-back this task from To Verify — an ADMIN, or the
   * immediate manager of at least one assignee. Always false unless status is TO_VERIFY. */
  canVerify: boolean;
  createdById: string;
  createdByName: string;
  /** Who approved this task (set only by APPROVE in the verification flow) — null unless status is DONE. */
  verifiedById: string | null;
  verifiedByName: string | null;
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
  assignee: PersonSummary | null;
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

// body is optional — a chat message can be file/voice-note-only with no text. The frontend still
// requires at least one of {text, attachment} before allowing Send; this schema alone doesn't
// enforce that cross-field rule since attachments upload as a separate follow-up request.
export const createCommentSchema = z.object({
  body: z.string().trim().max(4000).optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export interface CommentSummary {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarColor: string;
  body: string | null;
  attachments: AttachmentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentSummary {
  id: string;
  taskId: string;
  commentId: string | null;
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

// No create schema — entries are only ever produced by the Start/Complete timer (TasksService),
// never typed in manually. updateTimeEntrySchema still exists for corrections (e.g. someone left
// the timer running overnight by mistake).
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
  startedAt: string | null;
  endedAt: string | null;
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
  'TASK_VERIFICATION_REQUESTED',
  'TASK_VERIFIED',
  'TASK_SENT_BACK',
  'TASK_VERIFICATION_REJECTED',
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

// --- Slice 17: Organization settings ---

export const ORGANIZATION_PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const;
export type OrganizationPlanName = (typeof ORGANIZATION_PLANS)[number];

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type OrganizationStatusName = (typeof ORGANIZATION_STATUSES)[number];

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(80),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlanName;
  status: OrganizationStatusName;
  memberCount: number;
  createdAt: string;
}

// --- Slice 18: Superadmin platform management ---

export const updateOrganizationAdminSchema = z
  .object({
    plan: z.enum(ORGANIZATION_PLANS).optional(),
    status: z.enum(ORGANIZATION_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateOrganizationAdminInput = z.infer<typeof updateOrganizationAdminSchema>;

export interface AdminOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlanName;
  status: OrganizationStatusName;
  memberCount: number;
  createdAt: string;
}

// --- Slice 19: Google Meet integration (step 1 — connecting a Google Workspace account) ---

export interface GoogleIntegrationStatus {
  connected: boolean;
  googleEmail: string | null;
}

// --- Slice 20: platform-wide LLM settings (step 2 — meeting-note summarization) ---

export const updateLlmSettingsSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required'),
  model: z.string().trim().min(1).optional(),
});
export type UpdateLlmSettingsInput = z.infer<typeof updateLlmSettingsSchema>;

export interface LlmSettingsStatus {
  configured: boolean;
  model: string | null;
  updatedAt: string | null;
}

// --- Slice 21: MoM (Minutes of Meeting) PDF upload → AI-extracted task queue ---

export const updateMomAiSettingsSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required'),
  model: z.string().trim().min(1).optional(),
});
export type UpdateMomAiSettingsInput = z.infer<typeof updateMomAiSettingsSchema>;

export interface MomAiSettingsStatus {
  configured: boolean;
  model: string | null;
  updatedAt: string | null;
}

export const MOM_CANDIDATE_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type MomCandidateStatusName = (typeof MOM_CANDIDATE_STATUSES)[number];

export const MOM_UPLOAD_SOURCES = ['PDF', 'GOOGLE_MEET'] as const;
export type MomUploadSourceName = (typeof MOM_UPLOAD_SOURCES)[number];

export const listMomCandidatesQuerySchema = z.object({
  status: z.enum(MOM_CANDIDATE_STATUSES).optional(),
});
export type ListMomCandidatesQuery = z.infer<typeof listMomCandidatesQuerySchema>;

export const updateMomCandidateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    description: z.string().trim().min(1, 'Description is required').max(5000).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    assigneeId: z.string().cuid().nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });
export type UpdateMomCandidateInput = z.infer<typeof updateMomCandidateSchema>;

export interface MomUploadSummary {
  id: string;
  fileName: string;
  sizeBytes: number;
  itemsFound: number;
  itemsNew: number;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

export interface MomTaskCandidateSummary {
  id: string;
  momUploadId: string;
  momUploadFileName: string;
  momUploadSource: MomUploadSourceName;
  title: string;
  description: string;
  suggestedAssigneeName: string | null;
  suggestedAssigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriorityName;
  context: string | null;
  status: MomCandidateStatusName;
  createdTaskId: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MomUploadResult {
  itemsFound: number;
  itemsNew: number;
  itemsSkipped: number;
  candidates: MomTaskCandidateSummary[];
}

// --- Slice 22: Google Meet transcript sync — a second source feeding the same MOM queue above ---

export interface GoogleMeetSyncResult {
  meetingsChecked: number;
  meetingsSynced: number;
  itemsNew: number;
  itemsSkipped: number;
}
