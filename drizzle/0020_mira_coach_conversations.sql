CREATE TABLE `mira_coach_conversations` (
	`id` varchar(36) NOT NULL,
	`workspaceId` int NOT NULL,
	`ownerUserId` int NOT NULL,
	`revision` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_coach_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_coach_memory_proposals` (
	`id` varchar(36) NOT NULL,
	`turnId` varchar(36) NOT NULL,
	`text` text NOT NULL,
	`kind` enum('explicit','interpreted') NOT NULL,
	`status` enum('pending_confirmation','confirmed','rejected') NOT NULL DEFAULT 'pending_confirmation',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_coach_memory_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_coach_turns` (
	`id` varchar(36) NOT NULL,
	`conversationId` varchar(36) NOT NULL,
	`requestId` varchar(36) NOT NULL,
	`message` text NOT NULL,
	`expectedRevision` int NOT NULL,
	`status` enum('processing','complete','retryable_error') NOT NULL,
	`leaseToken` varchar(36),
	`leaseUntil` timestamp,
	`result` json,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_coach_turns_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_coach_turn_request_uidx` UNIQUE(`conversationId`,`requestId`)
);
--> statement-breakpoint
ALTER TABLE `mira_coach_conversations` ADD CONSTRAINT `mira_coach_conversations_workspaceId_mira_brand_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `mira_brand_workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_coach_conversations` ADD CONSTRAINT `mira_coach_conversations_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_coach_memory_proposals` ADD CONSTRAINT `mira_coach_memory_proposals_turnId_mira_coach_turns_id_fk` FOREIGN KEY (`turnId`) REFERENCES `mira_coach_turns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_coach_turns` ADD CONSTRAINT `mira_coach_turns_conversationId_mira_coach_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `mira_coach_conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_coach_conversation_scope_idx` ON `mira_coach_conversations` (`workspaceId`,`ownerUserId`);--> statement-breakpoint
CREATE INDEX `mira_coach_proposal_turn_idx` ON `mira_coach_memory_proposals` (`turnId`);--> statement-breakpoint
CREATE INDEX `mira_coach_turn_history_idx` ON `mira_coach_turns` (`conversationId`,`status`,`expectedRevision`);