import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { and, eq, sql, type SQL } from 'drizzle-orm';

const legacyTasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  type: text('type', { enum: ['have_to', 'need_to', 'want_to'] }).notNull(),
  status: text('status', { enum: ['backlog', 'today', 'done', 'archived'] }).notNull(),
  dateAdded: integer('date_added').notNull(),
  dateDone: integer('date_done'),
  dayKey: text('day_key'),
  calendarUid: text('calendar_uid'),
  sortOrder: integer('sort_order').notNull().default(0),
  source: text('source', { enum: ['manual', 'calendar', 'carryover', 'backlog_pull'] }).notNull().default('manual'),
});

const legacyMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

const legacyDayLog = sqliteTable('day_log', {
  dayKey: text('day_key').primaryKey(),
  createdAt: integer('created_at').notNull(),
  summaryJson: text('summary_json').notNull(),
});

// This value is set only by the authenticated website worker, never a request.
const workspaceKey = process.env.SATORI_WORKSPACE_KEY;
export const portalMode = workspaceKey !== undefined;
if (portalMode && !/^[a-z0-9_-]{1,64}$/.test(workspaceKey!)) throw new Error('Invalid workspace context');
const portalTasks = sqliteTable('portal_satori_tasks', {
  workspaceKey: text('workspace_key').notNull().$defaultFn(() => workspaceKey!),
  id: text('id').notNull(), text: text('text').notNull(),
  type: text('type', { enum: ['have_to','need_to','want_to'] }).notNull(),
  status: text('status', { enum: ['backlog','today','done','archived'] }).notNull(),
  dateAdded: integer('date_added').notNull(), dateDone: integer('date_done'),
  dayKey: text('day_key'), calendarUid: text('calendar_uid'),
  sortOrder: integer('sort_order').notNull().default(0),
  source: text('source', { enum: ['manual','calendar','carryover','backlog_pull'] }).notNull().default('manual'),
}, table => [primaryKey({columns:[table.workspaceKey,table.id]})]);
const portalMeta = sqliteTable('portal_satori_meta', {
  workspaceKey: text('workspace_key').notNull().$defaultFn(() => workspaceKey!),
  key: text('key').notNull(), value: text('value').notNull(),
}, table => [primaryKey({columns:[table.workspaceKey,table.key]})]);
const portalDayLog = sqliteTable('portal_satori_day_log', {
  workspaceKey: text('workspace_key').notNull().$defaultFn(() => workspaceKey!),
  dayKey: text('day_key').notNull(), createdAt: integer('created_at').notNull(),
  summaryJson: text('summary_json').notNull(),
}, table => [primaryKey({columns:[table.workspaceKey,table.dayKey]})]);

// Preserve the original service's task shape; the additional ownership column
// is supplied by Drizzle's server-side default on EVERY insert. Portal reads,
// updates and deletes must use the corresponding scope helper below.
export const tasks = portalMode ? portalTasks as unknown as typeof legacyTasks : legacyTasks;
export const appMeta = portalMode ? portalMeta as unknown as typeof legacyMeta : legacyMeta;
export const dayLog = portalMode ? portalDayLog as unknown as typeof legacyDayLog : legacyDayLog;
export const dayLogConflictTarget = portalMode ? [portalDayLog.workspaceKey,portalDayLog.dayKey] : [legacyDayLog.dayKey];
export const taskScope = (predicate?: SQL) => portalMode ? and(eq(portalTasks.workspaceKey,workspaceKey!),predicate)! : predicate || sql`1=1`;
export const metaScope = (predicate?: SQL) => portalMode ? and(eq(portalMeta.workspaceKey,workspaceKey!),predicate)! : predicate || sql`1=1`;
export const logScope = (predicate?: SQL) => portalMode ? and(eq(portalDayLog.workspaceKey,workspaceKey!),predicate)! : predicate || sql`1=1`;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type AppMeta = typeof appMeta.$inferSelect;
export type DayLog = typeof dayLog.$inferSelect;
