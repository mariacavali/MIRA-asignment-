CREATE TABLE `mira_call_qa_events` (
	`id` varchar(36) NOT NULL,
	`sessionId` varchar(36) NOT NULL,
	`shootId` int NOT NULL,
	`direction` enum('client','assistant') NOT NULL,
	`modality` enum('voice_transcript','text_fallback') NOT NULL,
	`content` text NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_call_qa_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD `summaryConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mira_call_qa_events` ADD CONSTRAINT `mira_call_qa_events_sessionId_mira_call_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `mira_call_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_call_qa_events` ADD CONSTRAINT `mira_call_qa_events_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_call_qa_events_owner_lookup_idx` ON `mira_call_qa_events` (`shootId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mira_call_qa_events_expiry_idx` ON `mira_call_qa_events` (`expiresAt`);