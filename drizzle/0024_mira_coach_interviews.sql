CREATE TABLE `mira_coach_interviews` (
  `conversationId` varchar(36) NOT NULL,
  `ledger` json NOT NULL,
  CONSTRAINT `mira_coach_interviews_conversationId` PRIMARY KEY (`conversationId`)
);
--> statement-breakpoint
ALTER TABLE `mira_coach_interviews` ADD CONSTRAINT `mira_coach_interview_conversation_fk` FOREIGN KEY (`conversationId`) REFERENCES `mira_coach_conversations` (`id`) ON DELETE cascade ON UPDATE no action;
