CREATE TABLE `mira_photographer_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mira_photographer_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `mira_photographer_credentials_user_uidx` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `mira_photographer_credentials` ADD CONSTRAINT `mira_photographer_credentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;