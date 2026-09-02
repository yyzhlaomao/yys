import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    role: text('role', { enum: ['admin', 'uploader'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'suspended'],
    }).notNull(),
    applicationNote: text('application_note'),
    createdAt: integer('created_at').notNull(),
    approvedAt: integer('approved_at'),
    approvedBy: text('approved_by'),
    lastLoginAt: integer('last_login_at'),
  },
  (table) => [
    uniqueIndex('idx_users_username').on(table.username),
    uniqueIndex('idx_users_email').on(table.email),
    index('idx_users_status_created_at').on(table.status, table.createdAt),
    check('users_role_check', sql`${table.role} IN ('admin', 'uploader')`),
    check(
      'users_status_check',
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'suspended')`,
    ),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastUsedAt: integer('last_used_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
);

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    coverObjectKey: text('cover_object_key'),
    coverContentType: text('cover_content_type'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_collections_owner_created_at').on(
      table.ownerId,
      table.createdAt,
    ),
    index('idx_collections_created_at').on(table.createdAt),
  ],
);

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    uploaderId: text('uploader_id').references(() => users.id),
    collectionId: text('collection_id').references(() => collections.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_media_object_key').on(table.objectKey),
    index('idx_media_created_at').on(table.createdAt),
    index('idx_media_collection_created_at').on(
      table.collectionId,
      table.createdAt,
    ),
    index('idx_media_uploader_created_at').on(
      table.uploaderId,
      table.createdAt,
    ),
    check('media_type_check', sql`${table.mediaType} IN ('image', 'video')`),
    check('media_size_check', sql`${table.size} >= 0`),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: text('details'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_audit_logs_created_at').on(table.createdAt)],
);
