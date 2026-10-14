CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_record_idx` ON `comments` (`record_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text,
	`description` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_time_idx` ON `events` (`created_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_time_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`phase` text DEFAULT 'Define' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`due` text DEFAULT '' NOT NULL,
	`source_id` text,
	`pinned` integer DEFAULT 0 NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation` text NOT NULL,
	`created_by` text NOT NULL,
	`created_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_source_unique` ON `records` (`source_id`);--> statement-breakpoint
CREATE INDEX `records_kind_idx` ON `records` (`kind`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
