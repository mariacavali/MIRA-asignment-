CREATE TABLE `mira_v4_visual_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`stage` enum('initial','refined','moodboard') NOT NULL,
	`status` enum('in_progress','complete','retryable_error') NOT NULL DEFAULT 'in_progress',
	`sourceFingerprint` varchar(64) NOT NULL,
	`promptVersion` varchar(64) NOT NULL,
	`campaignPlanJson` json,
	`referencesJson` json,
	`selectionJson` json,
	`refinementJson` json,
	`finalMoodboardUrl` varchar(1024),
	`errorCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v4_visual_sets_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_v4_visual_sets_journey_stage_uidx` UNIQUE(`journeyId`,`stage`)
);
--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` MODIFY COLUMN `currentStep` enum('quick_context','birth_details','recognition_ready','recognition','creative_brief','creative_discovery','inspiration','pre_generation_mirror','visual_discovery','visual_refinement','moodboard','brand_dna','brand_book') NOT NULL DEFAULT 'quick_context';--> statement-breakpoint
ALTER TABLE `mira_v4_visual_sets` ADD CONSTRAINT `mira_v4_visual_sets_journeyId_mira_v4_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v4_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v4_visual_sets` ADD CONSTRAINT `mira_v4_visual_sets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_v4_visual_sets_user_journey_idx` ON `mira_v4_visual_sets` (`userId`,`journeyId`);