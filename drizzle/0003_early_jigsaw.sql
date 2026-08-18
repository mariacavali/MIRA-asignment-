CREATE TABLE `mira_v4_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`userId` int NOT NULL,
	`ordinal` int NOT NULL,
	`role` enum('assistant','user') NOT NULL,
	`content` text NOT NULL,
	`provenance` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_v4_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_v4_messages_journey_ordinal_uidx` UNIQUE(`journeyId`,`ordinal`)
);
--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `turnCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mira_v4_messages` ADD CONSTRAINT `mira_v4_messages_journeyId_mira_v4_journeys_id_fk` FOREIGN KEY (`journeyId`) REFERENCES `mira_v4_journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v4_messages` ADD CONSTRAINT `mira_v4_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_v4_messages_user_journey_idx` ON `mira_v4_messages` (`userId`,`journeyId`);