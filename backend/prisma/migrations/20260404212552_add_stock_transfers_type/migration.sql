-- AlterTable
ALTER TABLE `stock_movement` ADD COLUMN `fromLocation` VARCHAR(191) NULL,
    ADD COLUMN `toLocation` VARCHAR(191) NULL,
    MODIFY `type` ENUM('RECEPTION', 'SORTIE', 'TRANSFER') NOT NULL;
