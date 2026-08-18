ALTER TABLE `mira_v4_journeys` MODIFY COLUMN `status` enum('intake','recognition','creative_discovery','brand_dna_draft','brand_dna_confirmed','complete','deleted') NOT NULL DEFAULT 'intake';--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` MODIFY COLUMN `status` enum('intake','recognition','creative_discovery','brand_dna_draft','brand_dna_confirmed','complete','deleted') NOT NULL DEFAULT 'intake';--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` MODIFY COLUMN `currentStep` enum('quick_context','birth_details','recognition_ready','recognition','creative_brief','creative_discovery','inspiration','pre_generation_mirror','visual_discovery','brand_dna','brand_book') NOT NULL DEFAULT 'quick_context';--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `creativeTurnCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `creativeInputs` json;--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `inspirationExplanation` text;--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `inspirationAssetId` varchar(36);--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `inspirationStorageKey` varchar(768);--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `inspirationOriginalName` varchar(255);--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `inspirationMimeType` varchar(64);--> statement-breakpoint
ALTER TABLE `mira_v4_journeys` ADD `inspirationByteSize` int;--> statement-breakpoint
ALTER TABLE `mira_v4_messages` ADD `phase` enum('recognition','creative_discovery') DEFAULT 'recognition' NOT NULL;
