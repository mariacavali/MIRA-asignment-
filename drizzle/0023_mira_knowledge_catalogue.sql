CREATE TABLE `mira_knowledge_catalogue` (
	`id` int NOT NULL,
	`revision` int NOT NULL DEFAULT 0,
	`activeReleaseId` varchar(36),
	CONSTRAINT `mira_knowledge_catalogue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mira_knowledge_releases` (
	`id` varchar(36) NOT NULL,
	`hash` varchar(64) NOT NULL,
	`bundle` json NOT NULL,
	`reviews` json NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`importedByUserId` int NOT NULL,
	`publishedByUserId` int,
	`parentReleaseId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp,
	CONSTRAINT `mira_knowledge_releases_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_knowledge_release_hash_uq` UNIQUE(`hash`)
);
--> statement-breakpoint
CREATE TABLE `mira_knowledge_versions` (
	`key` varchar(191) NOT NULL,
	`hash` varchar(64) NOT NULL,
	CONSTRAINT `mira_knowledge_versions_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `mira_knowledge_withdrawals` (
	`key` varchar(191) NOT NULL,
	`actorUserId` int NOT NULL,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mira_knowledge_withdrawals_key` PRIMARY KEY(`key`)
);
