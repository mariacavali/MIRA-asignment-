CREATE TABLE `mira_email_outbox` (
  `id` int AUTO_INCREMENT NOT NULL,
  `shootId` int NOT NULL,
  `invitationId` varchar(36) NOT NULL,
  `milestoneId` varchar(64) NOT NULL,
  `scheduledAt` timestamp NOT NULL,
  `status` enum('pending','processing','sent','failed','suppressed','cancelled') NOT NULL DEFAULT 'pending',
  `attemptCount` int NOT NULL DEFAULT 0,
  `lastErrorCategory` varchar(64),
  `idempotencyKey` varchar(191) NOT NULL,
  `leaseUntil` timestamp,
  `claimedAt` timestamp,
  `sentAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mira_email_outbox_id` PRIMARY KEY(`id`),
  CONSTRAINT `mira_email_outbox_invitation_fk` FOREIGN KEY (`invitationId`) REFERENCES `mira_client_invitations`(`id`) ON DELETE CASCADE,
  CONSTRAINT `mira_email_outbox_shoot_fk` FOREIGN KEY (`shootId`) REFERENCES `mira_shoots`(`id`) ON DELETE CASCADE,
  CONSTRAINT `mira_email_outbox_invitation_milestone_uidx` UNIQUE(`invitationId`,`milestoneId`),
  CONSTRAINT `mira_email_outbox_idempotency_uidx` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `mira_email_outbox_due_idx` ON `mira_email_outbox` (`status`,`scheduledAt`);
--> statement-breakpoint
CREATE INDEX `mira_email_outbox_lease_idx` ON `mira_email_outbox` (`status`,`leaseUntil`);