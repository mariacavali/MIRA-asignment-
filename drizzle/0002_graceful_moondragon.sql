CREATE TABLE `mira_v4_journeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('intake','recognition','brand_dna_draft','brand_dna_confirmed','complete','deleted') NOT NULL DEFAULT 'intake',
	`currentStep` enum('quick_context','birth_details','recognition_ready','recognition','visual_discovery','brand_dna','brand_book') NOT NULL DEFAULT 'quick_context',
	`building` text,
	`currentPosition` text,
	`needMost` text,
	`firstCreation` text,
	`birthDate` varchar(10),
	`birthTime` varchar(5),
	`birthTimeUnknown` int NOT NULL DEFAULT 0,
	`birthCity` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_v4_journeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD CONSTRAINT `mira_v4_journeys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_v4_journeys_user_status_idx` ON `mira_v4_journeys` (`userId`,`status`);