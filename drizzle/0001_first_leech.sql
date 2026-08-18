CREATE TABLE `mira_v3_consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`scope` enum('image_upload','image_analysis') NOT NULL,
	`status` enum('granted','revoked') NOT NULL,
	`policyVersion` varchar(32) NOT NULL,
	`grantedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_v3_consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_journeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('meditation','reflection','mirror_draft','mirror_confirmed','complete','deleted') NOT NULL DEFAULT 'meditation',
	`currentStep` varchar(64) NOT NULL DEFAULT 'meditation',
	`turnCount` int NOT NULL DEFAULT 0,
	`activeSessionId` varchar(36),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v3_journeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_media_assets` (
	`id` varchar(36) NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`sessionId` varchar(36),
	`kind` enum('reference_image') NOT NULL DEFAULT 'reference_image',
	`status` enum('uploaded','analyzed','removed','failed') NOT NULL DEFAULT 'uploaded',
	`storageKey` varchar(768) NOT NULL,
	`storageUrl` text NOT NULL,
	`originalName` varchar(255),
	`mimeType` varchar(128) NOT NULL,
	`byteSize` int NOT NULL,
	`analysis` json,
	`removedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v3_media_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`sessionId` varchar(36),
	`ordinal` int NOT NULL,
	`role` enum('system','assistant','user') NOT NULL,
	`content` text NOT NULL,
	`provenance` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_v3_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_v3_messages_journey_ordinal_uq` UNIQUE(`journeyId`,`ordinal`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_module_outputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`providerVersion` varchar(64),
	`status` enum('pending','complete','unavailable','failed') NOT NULL DEFAULT 'pending',
	`rawResult` json,
	`normalizedResult` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v3_module_outputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_reflection_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','confirmed','superseded') NOT NULL DEFAULT 'draft',
	`source` enum('ai','user_edit') NOT NULL DEFAULT 'ai',
	`bundle` json NOT NULL,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_v3_reflection_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_v3_reflection_revisions_journey_version_uq` UNIQUE(`journeyId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_render_artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`reflectionRevisionId` int NOT NULL,
	`deliverable` enum('mirror','brand_soul','visual_direction') NOT NULL,
	`format` enum('html','pdf') NOT NULL,
	`status` enum('pending','ready','failed') NOT NULL DEFAULT 'pending',
	`storageKey` varchar(768),
	`storageUrl` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v3_render_artifacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_v3_render_artifacts_revision_kind_format_uq` UNIQUE(`reflectionRevisionId`,`deliverable`,`format`)
);
--> statement-breakpoint
CREATE TABLE `mira_v3_sessions` (
	`id` varchar(36) NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('active','expired','closed') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v3_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mira_v3_consents` ADD CONSTRAINT `mira_v3_consents_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_consents` ADD CONSTRAINT `mira_v3_consents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_journeys` ADD CONSTRAINT `mira_v3_journeys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_media_assets` ADD CONSTRAINT `mira_v3_media_assets_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_media_assets` ADD CONSTRAINT `mira_v3_media_assets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_media_assets` ADD CONSTRAINT `mira_v3_media_assets_sessionId_mira_v3_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `mira_v3_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_messages` ADD CONSTRAINT `mira_v3_messages_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_messages` ADD CONSTRAINT `mira_v3_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_messages` ADD CONSTRAINT `mira_v3_messages_sessionId_mira_v3_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `mira_v3_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_module_outputs` ADD CONSTRAINT `mira_v3_module_outputs_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_module_outputs` ADD CONSTRAINT `mira_v3_module_outputs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_reflection_revisions` ADD CONSTRAINT `mira_v3_reflection_revisions_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_reflection_revisions` ADD CONSTRAINT `mira_v3_reflection_revisions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_render_artifacts` ADD CONSTRAINT `mira_v3_render_artifacts_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_render_artifacts` ADD CONSTRAINT `mira_v3_render_artifacts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_render_artifacts` ADD CONSTRAINT `mira_v3_render_artifacts_reflectionRevisionId_mira_v3_reflection_revisions_id_fk` FOREIGN KEY (`reflectionRevisionId`) REFERENCES `mira_v3_reflection_revisions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_sessions` ADD CONSTRAINT `mira_v3_sessions_journeyId_mira_v3_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v3_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_sessions` ADD CONSTRAINT `mira_v3_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_v3_consents_journey_scope_idx` ON `mira_v3_consents` (`journeyId`,`scope`);--> statement-breakpoint
CREATE INDEX `mira_v3_journeys_user_status_idx` ON `mira_v3_journeys` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `mira_v3_media_assets_journey_status_idx` ON `mira_v3_media_assets` (`journeyId`,`status`);--> statement-breakpoint
CREATE INDEX `mira_v3_messages_user_idx` ON `mira_v3_messages` (`userId`);--> statement-breakpoint
CREATE INDEX `mira_v3_module_outputs_journey_module_idx` ON `mira_v3_module_outputs` (`journeyId`,`module`);--> statement-breakpoint
CREATE INDEX `mira_v3_reflection_revisions_journey_status_idx` ON `mira_v3_reflection_revisions` (`journeyId`,`status`);--> statement-breakpoint
CREATE INDEX `mira_v3_render_artifacts_journey_idx` ON `mira_v3_render_artifacts` (`journeyId`);--> statement-breakpoint
CREATE INDEX `mira_v3_sessions_journey_idx` ON `mira_v3_sessions` (`journeyId`);--> statement-breakpoint
CREATE INDEX `mira_v3_sessions_user_status_idx` ON `mira_v3_sessions` (`userId`,`status`);