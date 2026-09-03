CREATE TABLE `mira_shoot_visual_references` (
	`id` varchar(36) NOT NULL,
	`shootId` int NOT NULL,
	`photographerUserId` int NOT NULL,
	`uploaderRole` enum('photographer','client') NOT NULL,
	`sourceKind` enum('uploaded_image','synthetic_fixture') NOT NULL DEFAULT 'uploaded_image',
	`evidenceKind` enum('observed','explicit_preference','mira_hypothesis','confirmed_direction') NOT NULL DEFAULT 'observed',
	`status` enum('uploaded','analyzed','failed','removed') NOT NULL DEFAULT 'uploaded',
	`storageKey` varchar(768) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`byteSize` int NOT NULL,
	`clientDescription` text,
	`analysisJson` json,
	`analysisModel` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_shoot_visual_references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mira_shoot_visual_references` ADD CONSTRAINT `mira_shoot_visual_references_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_shoot_visual_references` ADD CONSTRAINT `mira_shoot_visual_references_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mira_shoot_visual_refs_owner_idx` ON `mira_shoot_visual_references` (`photographerUserId`,`shootId`);--> statement-breakpoint
CREATE INDEX `mira_shoot_visual_refs_shoot_status_idx` ON `mira_shoot_visual_references` (`shootId`,`status`);