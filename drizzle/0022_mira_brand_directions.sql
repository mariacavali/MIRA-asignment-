CREATE TABLE `mira_brand_configurations` (
	`workspaceId` int NOT NULL,
	`configuration` json NOT NULL,
	CONSTRAINT `mira_brand_configurations_workspaceId` PRIMARY KEY(`workspaceId`)
);
--> statement-breakpoint
CREATE TABLE `mira_brand_directions` (
	`conversationId` varchar(36) NOT NULL,
	`records` json NOT NULL,
	`requests` json NOT NULL,
	CONSTRAINT `mira_brand_directions_conversationId` PRIMARY KEY(`conversationId`)
);
--> statement-breakpoint
ALTER TABLE `mira_brand_configurations` ADD CONSTRAINT `mira_brand_configuration_workspace_fk` FOREIGN KEY (`workspaceId`) REFERENCES `mira_brand_workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_brand_directions` ADD CONSTRAINT `mira_brand_direction_conversation_fk` FOREIGN KEY (`conversationId`) REFERENCES `mira_coach_conversations`(`id`) ON DELETE cascade ON UPDATE no action;