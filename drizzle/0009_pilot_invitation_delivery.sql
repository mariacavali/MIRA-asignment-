ALTER TABLE `mira_client_invitations` ADD `deliveryStatus` enum('created','sent','opened','preparation_in_progress','completed') DEFAULT 'created' NOT NULL;--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD `deliveryProvider` varchar(32);--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD `providerMessageId` varchar(191);--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD `preparationStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD `completedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mira_client_invitations` ADD `photographerNotifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD `clientPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `mira_shoots` ADD `invitationMessage` text;