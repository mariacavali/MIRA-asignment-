CREATE TABLE `mira_pending_checkouts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clientReferenceId` varchar(200) NOT NULL,
  `photographerUserId` int NOT NULL,
  `name` varchar(160) NOT NULL,
  `email` varchar(320) NOT NULL,
  `expectedPriceId` varchar(191) NOT NULL,
  `expectedCurrency` varchar(3) NOT NULL,
  `status` enum('pending','consumed','expired') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp,
  CONSTRAINT `mira_pending_checkouts_id` PRIMARY KEY(`id`),
  CONSTRAINT `mira_pending_checkouts_reference_uidx` UNIQUE(`clientReferenceId`),
  CONSTRAINT `mira_pending_checkouts_photographer_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `mira_pending_checkouts_status_expiry_idx` ON `mira_pending_checkouts` (`status`,`expiresAt`);
--> statement-breakpoint
CREATE TABLE `mira_stripe_billing_identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `photographerUserId` int NOT NULL,
  `stripeCustomerId` varchar(191) NOT NULL,
  `stripeSubscriptionId` varchar(191),
  `stripePriceId` varchar(191) NOT NULL,
  `currency` varchar(3) NOT NULL,
  `paymentState` enum('pending','active','past_due','cancelled','expired') NOT NULL DEFAULT 'pending',
  `cancelAtPeriodEnd` int NOT NULL DEFAULT 0,
  `cancelAt` timestamp,
  `currentPeriodEnd` timestamp,
  `cancellationAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `mira_stripe_billing_identities_id` PRIMARY KEY(`id`),
  CONSTRAINT `mira_stripe_billing_user_uidx` UNIQUE(`photographerUserId`),
  CONSTRAINT `mira_stripe_billing_customer_uidx` UNIQUE(`stripeCustomerId`),
  CONSTRAINT `mira_stripe_billing_subscription_uidx` UNIQUE(`stripeSubscriptionId`),
  CONSTRAINT `mira_stripe_billing_photographer_fk` FOREIGN KEY (`photographerUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `mira_stripe_billing_state_idx` ON `mira_stripe_billing_identities` (`paymentState`);
--> statement-breakpoint
CREATE TABLE `mira_processed_stripe_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `stripeEventId` varchar(191) NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `processingResult` varchar(64) NOT NULL,
  `processedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `mira_processed_stripe_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `mira_processed_stripe_events_event_uidx` UNIQUE(`stripeEventId`)
);
