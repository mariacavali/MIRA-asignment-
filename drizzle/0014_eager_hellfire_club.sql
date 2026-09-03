CREATE TABLE `mira_shoot_moodboard` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shootId` int NOT NULL,
	`photographerUserId` int NOT NULL,
	`confirmedMemoryVersion` int NOT NULL,
	`promptVersion` varchar(64) NOT NULL,
	`sourceFingerprint` varchar(64) NOT NULL,
	`status` enum('pending','in_progress','complete','retryable_error') NOT NULL DEFAULT 'pending',
	`renderStatus` enum('not_configured','pending','complete','failed') NOT NULL DEFAULT 'pending',
	`campaignPlanJson` json,
	`referencesJson` json,
	`errorCode` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_shoot_moodboard_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_shoot_moodboard_memory_uidx` UNIQUE(`shootId`,`confirmedMemoryVersion`)
);
--> statement-breakpoint
ALTER TABLE `mira_shoot_moodboard` ADD CONSTRAINT `mira_shoot_moodboard_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoot_moodboard` ADD CONSTRAINT `mira_shoot_moodboard_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_shoot_moodboard_owner_idx` ON `mira_shoot_moodboard` (`photographerUserId`,`shootId`);