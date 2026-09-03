CREATE TABLE `mira_call_events` (
	`id` varchar(36) NOT NULL,
	`sessionId` varchar(36) NOT NULL,
	`shootId` int NOT NULL,
	`ordinal` int NOT NULL,
	`role` enum('assistant','client') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_call_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_call_events_session_ordinal_uidx` UNIQUE(`sessionId`,`ordinal`)
);
--> statement-breakpoint
CREATE TABLE `mira_call_sessions` (
	`id` varchar(36) NOT NULL,
	`invitationId` varchar(36) NOT NULL,
	`shootId` int NOT NULL,
	`photographerUserId` int NOT NULL,
	`mode` enum('text_test','realtime') NOT NULL DEFAULT 'text_test',
	`status` enum('active','paused','ended','failed') NOT NULL DEFAULT 'active',
	`turnCount` int NOT NULL DEFAULT 0,
	`allowedSeconds` int NOT NULL,
	`consumedSeconds` int NOT NULL DEFAULT 0,
	`providerCallId` varchar(191),
	`promptVersion` varchar(64) NOT NULL,
	`memoryVersionStart` int NOT NULL DEFAULT 0,
	`memoryVersionEnd` int,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`endReason` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_call_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_call_sessions_invitation_uidx` UNIQUE(`invitationId`)
);
--> statement-breakpoint
CREATE TABLE `mira_client_invitations` (
	`id` varchar(36) NOT NULL,
	`shootId` int NOT NULL,
	`photographerUserId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`status` enum('active','completed','expired','revoked') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`maxSessions` int NOT NULL DEFAULT 1,
	`consentPolicyVersion` varchar(32) NOT NULL,
	`consentAcknowledgedAt` timestamp,
	`lastOpenedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_client_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_client_invitations_token_uidx` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `mira_photographer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`businessName` varchar(200),
	`timezone` varchar(128) NOT NULL,
	`onboardingStatus` enum('started','complete') NOT NULL DEFAULT 'started',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_photographer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_photographer_profiles_user_uidx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `mira_shoot_memory_revisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shootId` int NOT NULL,
	`photographerUserId` int NOT NULL,
	`version` int NOT NULL,
	`schemaVersion` varchar(16) NOT NULL,
	`source` enum('call','photographer','system') NOT NULL,
	`snapshotJson` json NOT NULL,
	`patchJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_shoot_memory_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_shoot_memory_revisions_shoot_version_uidx` UNIQUE(`shootId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `mira_shoots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`photographerUserId` int NOT NULL,
	`sourceMode` enum('maria_photography','mira_saas') NOT NULL,
	`externalSourceId` varchar(191),
	`status` enum('draft','client_invited','conversation_in_progress','preparation_ready','photographer_review','revisions_requested','approved','ready_to_shoot','archived') NOT NULL DEFAULT 'draft',
	`title` varchar(200) NOT NULL,
	`clientName` varchar(160),
	`clientEmail` varchar(320),
	`scheduledAt` timestamp,
	`timezone` varchar(128) NOT NULL,
	`intendedUse` text,
	`location` text,
	`callAllowanceSeconds` int NOT NULL DEFAULT 1200,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_shoots_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_shoots_source_external_uidx` UNIQUE(`sourceMode`,`externalSourceId`)
);
--> statement-breakpoint
ALTER TABLE `mira_call_events` ADD CONSTRAINT `mira_call_events_sessionId_mira_call_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `mira_call_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_call_events` ADD CONSTRAINT `mira_call_events_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD CONSTRAINT `mira_call_sessions_invitationId_mira_client_invitations_id_fk` FOREIGN KEY (`invitationId`) REFERENCES `mira_client_invitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD CONSTRAINT `mira_call_sessions_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD CONSTRAINT `mira_call_sessions_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD CONSTRAINT `mira_client_invitations_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD CONSTRAINT `mira_client_invitations_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_photographer_profiles` ADD CONSTRAINT `mira_photographer_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoot_memory_revisions` ADD CONSTRAINT `mira_shoot_memory_revisions_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoot_memory_revisions` ADD CONSTRAINT `mira_shoot_memory_revisions_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD CONSTRAINT `mira_shoots_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_call_sessions_invitation_status_idx` ON `mira_call_sessions` (`invitationId`,`status`);--> statement-breakpoint
CREATE INDEX `mira_call_sessions_shoot_idx` ON `mira_call_sessions` (`shootId`);--> statement-breakpoint
CREATE INDEX `mira_client_invitations_shoot_status_idx` ON `mira_client_invitations` (`shootId`,`status`);--> statement-breakpoint
CREATE INDEX `mira_shoot_memory_revisions_owner_idx` ON `mira_shoot_memory_revisions` (`photographerUserId`,`shootId`);--> statement-breakpoint
CREATE INDEX `mira_shoots_photographer_status_idx` ON `mira_shoots` (`photographerUserId`,`status`);