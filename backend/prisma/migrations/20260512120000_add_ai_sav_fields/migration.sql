ALTER TABLE `tickets`
    ADD COLUMN `aiSummary` TEXT NULL,
    ADD COLUMN `aiUrgency` VARCHAR(20) NULL,
    ADD COLUMN `aiProbableCauses` LONGTEXT NULL,
    ADD COLUMN `aiSuggestedParts` LONGTEXT NULL,
    ADD COLUMN `aiChecklist` LONGTEXT NULL;
