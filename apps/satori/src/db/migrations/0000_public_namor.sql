CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `day_log` (
	`day_key` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`summary_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`date_added` integer NOT NULL,
	`date_done` integer,
	`day_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL
);

