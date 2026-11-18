CREATE TABLE `mira_coach_sources` (
	`id` varchar(36) NOT NULL,
	`conversationId` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`text` text NOT NULL,
	`referenceUrl` varchar(2048),
	`rightsBasis` enum('client_owned','permission_granted') NOT NULL,
	`status` enum('active','withdrawn') NOT NULL DEFAULT 'active',
	`approvedByUserId` int NOT NULL,
	`approvedAt` timestamp NOT NULL DEFAULT (now()),
	`withdrawnAt` timestamp,
	CONSTRAINT `mira_coach_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mira_coach_sources` ADD CONSTRAINT `mira_coach_sources_conversationId_mira_coach_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `mira_coach_conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_coach_sources` ADD CONSTRAINT `mira_coach_sources_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_coach_source_scope_idx` ON `mira_coach_sources` (`conversationId`,`status`);