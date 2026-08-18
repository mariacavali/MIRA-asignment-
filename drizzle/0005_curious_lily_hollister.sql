CREATE TABLE `mira_v4_creative_dna` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`schemaVersion` varchar(16) NOT NULL,
	`promptVersion` varchar(64) NOT NULL,
	`status` enum('in_progress','complete','retryable_error') NOT NULL DEFAULT 'in_progress',
	`creativeDnaJson` json,
	`sourceFingerprint` varchar(64) NOT NULL,
	`model` varchar(128),
	`errorCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v4_creative_dna_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_v4_creative_dna_journey_uidx` UNIQUE(`journeyId`)
);
--> statement-breakpoint
ALTER TABLE `mira_v4_creative_dna` ADD CONSTRAINT `mira_v4_creative_dna_journeyId_mira_v4_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v4_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v4_creative_dna` ADD CONSTRAINT `mira_v4_creative_dna_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_v4_creative_dna_user_journey_idx` ON `mira_v4_creative_dna` (`userId`,`journeyId`);