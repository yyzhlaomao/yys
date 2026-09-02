CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`media_type` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "media_type_check" CHECK(`media`.`media_type` IN ('image', 'video')),
	CONSTRAINT "media_size_check" CHECK(`media`.`size` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_object_key` ON `media` (`object_key`);
--> statement-breakpoint
CREATE INDEX `idx_media_created_at` ON `media` (`created_at`);
