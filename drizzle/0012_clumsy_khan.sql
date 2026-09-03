CREATE TABLE `mira_discovery_summaries` (
	`id` varchar(36) NOT NULL,
	`shootId` int NOT NULL,
	`sessionId` varchar(36) NOT NULL,
	`photographerUserId` int NOT NULL,
	`memoryVersion` int NOT NULL,
	`summaryText` text NOT NULL,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_discovery_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_discovery_summaries_session_memory_uidx` UNIQUE(`sessionId`,`memoryVersion`)
);
--> statement-breakpoint
CREATE TABLE `mira_shoot_creative_dna` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shootId` int NOT NULL,
	`photographerUserId` int NOT NULL,
	`confirmedMemoryVersion` int NOT NULL,
	`schemaVersion` varchar(16) NOT NULL,
	`promptVersion` varchar(64) NOT NULL,
	`sourceFingerprint` varchar(64) NOT NULL,
	`status` enum('pending','in_progress','complete','retryable_error') NOT NULL DEFAULT 'pending',
	`model` varchar(128),
	`creativeDnaJson` json,
	`errorCode` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_shoot_creative_dna_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_shoot_creative_dna_memory_uidx` UNIQUE(`shootId`,`confirmedMemoryVersion`)
);
--> statement-breakpoint
ALTER TABLE `mira_call_sessions` DROP INDEX `mira_call_sessions_invitation_uidx`;--> statement-breakpoint
ALTER TABLE `mira_photographer_profiles` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `mira_photographer_profiles` ADD `photographyStyle` text;--> statement-breakpoint
ALTER TABLE `mira_photographer_profiles` ADD `areasOfExpertise` json;--> statement-breakpoint
ALTER TABLE `mira_photographer_profiles` ADD `websiteUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `mira_photographer_profiles` ADD `instagramUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD `shootType` varchar(160);--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD `durationMinutes` int;--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD `photographerNotes` text;--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD `roomState` enum('welcome','discovery_offered','discovery_in_progress','summary_pending','discovery_confirmed','preparation_active') DEFAULT 'welcome' NOT NULL;--> statement-breakpoint
ALTER TABLE `mira_discovery_summaries` ADD CONSTRAINT `mira_discovery_summaries_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_discovery_summaries` ADD CONSTRAINT `mira_discovery_summaries_sessionId_mira_call_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `mira_call_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_discovery_summaries` ADD CONSTRAINT `mira_discovery_summaries_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoot_creative_dna` ADD CONSTRAINT `mira_shoot_creative_dna_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoot_creative_dna` ADD CONSTRAINT `mira_shoot_creative_dna_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_discovery_summaries_shoot_idx` ON `mira_discovery_summaries` (`shootId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mira_shoot_creative_dna_owner_idx` ON `mira_shoot_creative_dna` (`photographerUserId`,`shootId`);