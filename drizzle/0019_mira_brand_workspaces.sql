CREATE TABLE `mira_brand_workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_brand_workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_workspace_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`capability` enum('brand_coaching','brand_book','launch_support','shoot_preparation') NOT NULL,
	`status` enum('active','suspended','revoked') NOT NULL DEFAULT 'suspended',
	`startsAt` timestamp NOT NULL,
	`expiresAt` timestamp,
	`sourceReference` varchar(191) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_workspace_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_workspace_grant_uidx` UNIQUE(`workspaceId`,`capability`)
);
--> statement-breakpoint
CREATE TABLE `mira_workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('editor','viewer') NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_workspace_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_workspace_member_uidx` UNIQUE(`workspaceId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `mira_brand_workspaces` ADD CONSTRAINT `mira_brand_workspaces_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_workspace_grants` ADD CONSTRAINT `mira_workspace_grants_workspaceId_mira_brand_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `mira_brand_workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_workspace_members` ADD CONSTRAINT `mira_workspace_members_workspaceId_mira_brand_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `mira_brand_workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_workspace_members` ADD CONSTRAINT `mira_workspace_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_workspaces_owner_status_idx` ON `mira_brand_workspaces` (`ownerUserId`,`status`);--> statement-breakpoint
CREATE INDEX `mira_workspace_member_user_idx` ON `mira_workspace_members` (`userId`,`status`);