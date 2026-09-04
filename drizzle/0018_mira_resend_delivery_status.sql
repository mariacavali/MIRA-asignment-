ALTER TABLE `mira_email_outbox` DROP FOREIGN KEY `mira_email_outbox_shoot_fk`;
--> statement-breakpoint
ALTER TABLE `mira_email_outbox` DROP FOREIGN KEY `mira_email_outbox_invitation_fk`;
--> statement-breakpoint
ALTER TABLE `mira_pending_checkouts` DROP FOREIGN KEY `mira_pending_checkouts_photographer_fk`;
--> statement-breakpoint
ALTER TABLE `mira_stripe_billing_identities` DROP FOREIGN KEY `mira_stripe_billing_photographer_fk`;
--> statement-breakpoint
ALTER TABLE `mira_v3_render_artifacts` DROP FOREIGN KEY `mira_render_artifacts_reflection_revision_fk`;
--> statement-breakpoint
ALTER TABLE `mira_client_invitations` MODIFY COLUMN `deliveryStatus` enum('created','queued','sent','delivered','failed','opened','preparation_in_progress','completed') NOT NULL DEFAULT 'created';--> statement-breakpoint
ALTER TABLE `mira_email_outbox` MODIFY COLUMN `status` enum('pending','processing','sent','delivered','failed','suppressed','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `mira_email_outbox` ADD `providerMessageId` varchar(191);--> statement-breakpoint
ALTER TABLE `mira_email_outbox` ADD CONSTRAINT `mira_email_outbox_shootId_mira_shoots_id_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_email_outbox` ADD CONSTRAINT `mira_email_outbox_invitationId_mira_client_invitations_id_fk` FOREIGN KEY (`invitationId`) REFERENCES `mira_client_invitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_pending_checkouts` ADD CONSTRAINT `mira_pending_checkouts_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_stripe_billing_identities` ADD CONSTRAINT `mira_stripe_billing_identities_photographerUserId_users_id_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mira_v3_render_artifacts` ADD CONSTRAINT `mira_v3_render_artifacts_reflectionRevisionId_mira_v3_reflection_revisions_id_fk` FOREIGN KEY (`reflectionRevisionId`) REFERENCES `mira_v3_reflection_revisions`(`id`) ON DELETE cascade ON UPDATE no action;