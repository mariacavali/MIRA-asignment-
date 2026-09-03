ALTER TABLE `mira_call_sessions` ADD `activeSlot` int;--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD `lastConnectedAt` timestamp;--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD `reconnectUntil` timestamp;--> statement-breakpoint
ALTER TABLE `mira_call_sessions` ADD CONSTRAINT `mira_call_sessions_shoot_active_uidx` UNIQUE(`shootId`,`activeSlot`);