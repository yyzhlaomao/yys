import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    objectKey: text('object_key').notNull(),
    originalName: text('original_name').notNull(),
    mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_media_object_key').on(table.objectKey),
    index('idx_media_created_at').on(table.createdAt),
    check('media_type_check', sql`${table.mediaType} IN ('image', 'video')`),
    check('media_size_check', sql`${table.size} >= 0`),
  ],
);
