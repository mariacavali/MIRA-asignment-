CREATE TABLE `mira_coach_call_clocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`clock` json NOT NULL,
	CONSTRAINT `mira_coach_call_clocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_call_clock_scope_uidx` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `mira_coach_call_clocks` ADD CONSTRAINT `mira_call_clock_workspace_fk` FOREIGN KEY (`workspaceId`) REFERENCES `mira_brand_workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_coach_call_clocks` ADD CONSTRAINT `mira_call_clock_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
