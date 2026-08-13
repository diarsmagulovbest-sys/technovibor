CREATE TABLE `import_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`file_hash` text NOT NULL,
	`file_name` text NOT NULL,
	`supplier_name` text NOT NULL,
	`analysis_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_import_analyses_expires_at` ON `import_analyses` (`expires_at`);--> statement-breakpoint
CREATE TABLE `import_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_name` text NOT NULL,
	`fingerprint` text NOT NULL,
	`mapping_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_profiles_fingerprint_unique` ON `import_profiles` (`fingerprint`);--> statement-breakpoint
ALTER TABLE `offers` ADD `stock` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `category` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `subcategory` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `attributes_json` text DEFAULT '{}' NOT NULL;